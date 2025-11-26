from fastapi import FastAPI, HTTPException, Query
import pandas as pd
from pathlib import Path
from typing import Optional, Any, Dict

app = FastAPI(title="CSV Query API")

# Base directory (repository root)
BASE_DIR = Path(__file__).resolve().parents[1]
SERVER_DIR = BASE_DIR / "server"
INPUT_DIR = SERVER_DIR / "Input"

# Allow any folder under server whose name starts with 'Output'
OUTPUT_DIRS = [p for p in SERVER_DIR.iterdir() if p.is_dir() and p.name.lower().startswith("output")]

def _is_allowed(path: Path) -> bool:
    """Return True if path is a file inside the allowed input or output directories."""
    try:
        path = path.resolve()
    except Exception:
        return False
    # must be under server/Input
    try:
        if INPUT_DIR.resolve() in path.parents or path == INPUT_DIR.resolve():
            return True
    except Exception:
        pass
    # or under any output folder
    for out in OUTPUT_DIRS:
        try:
            if out.resolve() in path.parents or path == out.resolve():
                return True
        except Exception:
            continue
    return False


@app.get("/csv/value")
def get_csv_value(
    file: str = Query(..., description="Relative path to CSV file from the repo root or server folder, e.g. 'server/Input/my.csv' or 'server/Output_16s/TM_Components/10_components.csv'."),
    row: Optional[str] = Query(None, description="Row identifier (index label) or integer index (0-based). If omitted returns full column or whole CSV."),
    col: Optional[str] = Query(None, description="Column identifier (column name) or integer index (0-based). If omitted returns full row or whole CSV."),
):
    # Resolve path (allow either absolute or repo-relative)
    request_path = Path(file)
    if not request_path.is_absolute():
        # allow both 'server/...' and paths relative to repo root
        request_path = BASE_DIR / request_path
    try:
        request_path = request_path.resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file path")

    # Basic checks
    if not request_path.exists() or not request_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    if request_path.suffix.lower() != ".csv":
        raise HTTPException(status_code=400, detail="Only .csv files are supported")
    if not _is_allowed(request_path):
        raise HTTPException(status_code=403, detail="Access to this path is not allowed")

    # Read CSV: prefer index_col=0 (many files in this project use that format)
    try:
        df = pd.read_csv(request_path, index_col=0, header=0)
    except Exception:
        # fallback to no index column
        try:
            df = pd.read_csv(request_path, header=0)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read CSV: {e}")

    def _normalize(v: Any) -> Any:
        if pd.isna(v):
            return None
        try:
            return v.item()
        except Exception:
            try:
                return v.tolist()
            except Exception:
                return v if isinstance(v, (str, int, float, bool)) else str(v)

    def _resolve_index_label(index, key: str):
        # try to match by string form first
        for idx in index:
            if str(idx) == key:
                return idx
        # try integer position
        try:
            ki = int(key)
            if 0 <= ki < len(index):
                return index[ki]
        except Exception:
            pass
        return None

    def _parse_index_spec(index, spec: str):
        """Parse a spec which may be a single label/index, a comma-separated list, or a range `start:end`.

        Returns a list of index labels (could be length 0 if nothing found).
        Range semantics:
        - If start/end match index labels (by string equality), the range is inclusive of the end label.
        - If start/end are integers (positions) the range follows Python slice semantics (end exclusive).
        - Multiple specs can be comma-separated, e.g. `0:3,10,15:18`.
        """
        if spec is None:
            return []
        labels = []
        parts = [p.strip() for p in spec.split(",") if p.strip() != ""]
        for part in parts:
            if ":" in part:
                a, b = part.split(":", 1)
                a = a.strip()
                b = b.strip()
                # resolve start position
                if a == "":
                    start_pos = 0
                else:
                    # try match by string label
                    start_pos = None
                    for i, idx in enumerate(index):
                        if str(idx) == a:
                            start_pos = i
                            break
                    if start_pos is None:
                        try:
                            start_pos = int(a)
                        except Exception:
                            raise HTTPException(status_code=400, detail=f"Invalid range start: {a}")
                # resolve end position
                if b == "":
                    end_pos = len(index)
                else:
                    end_pos = None
                    for i, idx in enumerate(index):
                        if str(idx) == b:
                            end_pos = i + 1  # inclusive label -> make end exclusive
                            break
                    if end_pos is None:
                        try:
                            end_pos = int(b)
                        except Exception:
                            raise HTTPException(status_code=400, detail=f"Invalid range end: {b}")
                # clip
                start_pos = max(0, int(start_pos))
                end_pos = min(len(index), int(end_pos))
                if start_pos < end_pos:
                    labels.extend(list(index[start_pos:end_pos]))
            else:
                # single element: try match by string label first
                matched = False
                for idx in index:
                    if str(idx) == part:
                        labels.append(idx)
                        matched = True
                        break
                if matched:
                    continue
                # try integer position
                try:
                    pos = int(part)
                    if 0 <= pos < len(index):
                        labels.append(index[pos])
                        continue
                except Exception:
                    pass
                # not found
                raise HTTPException(status_code=404, detail=f"Index element not found: {part}")
        return labels

    # If neither row nor col specified -> return entire CSV as nested dict (index -> {col: val})
    if row is None and col is None:
        out = {}
        for ridx, rowvals in df.iterrows():
            out[str(ridx)] = {str(c): _normalize(rowvals[c]) for c in df.columns}
        return {"file": str(request_path.relative_to(BASE_DIR)), "data": out}

    # If only row specified -> support single label or list/range; return dict(s)
    if row is not None and col is None:
        rows = _parse_index_spec(df.index, row)
        if not rows:
            raise HTTPException(status_code=404, detail="Row(s) not found")
        if len(rows) == 1:
            series = df.loc[rows[0]]
            return {
                "file": str(request_path.relative_to(BASE_DIR)),
                "row": str(rows[0]),
                "row_values": {str(c): _normalize(series[c]) for c in df.columns},
            }
        # multiple rows -> return mapping row->{col:val}
        out = {}
        for r in rows:
            series = df.loc[r]
            out[str(r)] = {str(c): _normalize(series[c]) for c in df.columns}
        return {"file": str(request_path.relative_to(BASE_DIR)), "data": out}

    # If only column specified -> support single label or list/range; return dict(s)
    if row is None and col is not None:
        cols = _parse_index_spec(df.columns, col)
        if not cols:
            raise HTTPException(status_code=404, detail="Column(s) not found")
        if len(cols) == 1:
            series = df[cols[0]]
            return {
                "file": str(request_path.relative_to(BASE_DIR)),
                "column": str(cols[0]),
                "column_values": {str(r): _normalize(series.loc[r]) for r in df.index},
            }
        out = {}
        for c in cols:
            series = df[c]
            out[str(c)] = {str(r): _normalize(series.loc[r]) for r in df.index}
        return {"file": str(request_path.relative_to(BASE_DIR)), "data": out}

    # Both row and col provided -> support lists/ranges on both
    rows = _parse_index_spec(df.index, row)
    cols = _parse_index_spec(df.columns, col)
    if not rows:
        raise HTTPException(status_code=404, detail="Row(s) not found")
    if not cols:
        raise HTTPException(status_code=404, detail="Column(s) not found")

    # single cell
    if len(rows) == 1 and len(cols) == 1:
        r = rows[0]
        c = cols[0]
        try:
            val = df.at[r, c]
        except Exception:
            try:
                rpos = list(df.index).index(r)
                cpos = list(df.columns).index(c)
                val = df.iloc[rpos, cpos]
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to retrieve value: {e}")
        return {"file": str(request_path.relative_to(BASE_DIR)), "row": str(r), "column": str(c), "value": _normalize(val)}

    # multiple rows and/or columns -> return nested mapping row->{col:val}
    out = {}
    for r in rows:
        rowvals = {}
        for c in cols:
            try:
                v = df.at[r, c]
            except Exception:
                try:
                    rpos = list(df.index).index(r)
                    cpos = list(df.columns).index(c)
                    v = df.iloc[rpos, cpos]
                except Exception:
                    v = None
            rowvals[str(c)] = _normalize(v)
        out[str(r)] = rowvals
    return {"file": str(request_path.relative_to(BASE_DIR)), "data": out}