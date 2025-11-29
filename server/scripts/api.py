from fastapi import FastAPI, HTTPException, Query
import pandas as pd
from pathlib import Path
from typing import Optional, Any, Dict
from fastapi import Response
import json
from typing import List
try:
    # when imported as package (e.g. server.scripts.api)
    from .helper_functions import generateSampleKeys
except Exception:
    try:
        # when run directly from scripts folder
        from helper_functions import generateSampleKeys
    except Exception:
        # fallback to absolute module path
        from server.scripts.helper_functions import generateSampleKeys

axis_types = {
    "metadata": {"column": "attribute", "row": "sample"},
    "topic": {"column": "topic", "row": "sample"},
    "component": {"column": "otu", "row": "topic"},
    "otu": {"column": "otu", "row": "sample"},
    "taxonomy": {"column": "attribute", "row": "otu"},
}

app = FastAPI(title="CSV Query API")

# Base directory (the `server` folder)
# For scripts under `server/scripts`, parents[1] yields the `server` directory.
BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "DATA"

# Mount static files from `server/static` so the UI can be served from the same origin
try:
    from fastapi.staticfiles import StaticFiles
    static_dir = BASE_DIR / 'static'
    if static_dir.exists():
        app.mount('/static', StaticFiles(directory=str(static_dir)), name='static')
except Exception:
    pass

@app.get("/data")
def get_data(attribute: str = Query(...)):
    # Parse JSON string
    try:
        payload = json.loads(attribute)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON in 'attribute' parameter")

    file_rel = payload.get("file")
    if not isinstance(file_rel, str) or not file_rel:
        raise HTTPException(status_code=400, detail="'file' key must be provided in attribute JSON and be a string")
    
    table_type = payload.get("table_type", "data")
    if table_type not in axis_types.keys():
        raise HTTPException(status_code=400, detail="Invalid 'table_type'. Must be one of: " + ", ".join(axis_types.keys()))
    axis = axis_types.get(table_type)
    row_type = axis["row"]
    column_type = axis["column"]

    specs = payload.get("specs", {})
    samplekeys = []
    if(row_type == "sample"):
        sample = specs.get("sample")
        if sample is None:
            raise HTTPException(status_code=400, detail="'sample' spec must be provided under 'specs' when 'sample' is used as row or column type")
        samplekeys = generateSampleKeys(sample)

    # Load CSV file
    file_path = DATA_DIR / file_rel
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {file_rel}")
    # Read CSV into DataFrame
    try:
        df = pd.read_csv(file_path, dtype=str)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read CSV: {e}")

    # Helper to extract allowed labels for an axis
    def allowed_for_axis(axis_name: str) -> List[str]:
        specs = payload.get("specs", {})
        # sample handled separately
        if axis_name == "sample":
            return samplekeys
        spec = specs.get(axis_name, {})
        type_ = spec.get("type", "all")

        if axis_name == "topic":
            if type_ == "all":
                # pick all columns that are integer-like
                cols = [c for c in df.columns if c is not None]
                ints = []
                for c in cols:
                    try:
                        ints.append(str(int(c)))
                    except Exception:
                        continue
                return ints
            if type_ == "single":
                val = spec.get("value")
                if isinstance(val, list):
                    return [str(val[0])]
                return [str(val)]
            if type_ == "list":
                return [str(v) for v in spec.get("value", [])]
            if type_ == "range":
                vals = spec.get("value", [])
                if len(vals) >= 2:
                    start, end = int(vals[0]), int(vals[1])
                    return [str(i) for i in range(start, end + 1)]
                return []

        if axis_name == "otu":
            prefix = spec.get("prefix", "")
            if type_ == "all":
                return [c for c in df.columns if isinstance(c, str) and c.startswith(prefix)]
            vals = spec.get("value", [])
            if type_ == "single":
                v = vals[0] if isinstance(vals, list) and vals else vals
                return [f"{prefix}{v}"]
            if type_ == "list":
                return [f"{prefix}{v}" for v in vals]

        if axis_name == "attribute":
            if type_ == "all":
                # all columns which are non-numeric
                return [c for c in df.columns if isinstance(c, str)]
            if type_ == "single":
                val = spec.get("value")
                if isinstance(val, list):
                    return [str(val[0])]
                return [str(val)]
            if type_ == "list":
                return [str(v) for v in spec.get("value", [])]

        # default: return empty (means no filtering)
        return []

    # Determine allowed rows and columns
    allowed_rows = None
    allowed_cols = None
    allowed_rows = allowed_for_axis(row_type)
    allowed_cols = allowed_for_axis(column_type)

    # Convert allowed lists to strings
    if allowed_rows is not None:
        allowed_rows = [str(x) for x in allowed_rows]
    if allowed_cols is not None:
        allowed_cols = [str(x) for x in allowed_cols]

    #print(f"Filtering rows ({row_type}): {allowed_rows if allowed_rows else 'none'}")
    #print(f"Filtering columns ({column_type}): {allowed_cols if allowed_cols else 'none'}")

    # Filter rows: keep rows where the FIRST column value is in allowed_rows
    if allowed_rows is not None and len(allowed_rows) > 0:
        try:
            mask = df[df.columns[0]].astype(str).isin(allowed_rows)
        except Exception:
            mask = [str(v) in allowed_rows for v in df[df.columns[0]]]
        df = df[mask]

    print(f"Rows after filtering: {len(df)}")

    # Filter columns
    if allowed_cols is not None and len(allowed_cols) > 0:
        # Ensure we keep the first column (sample/key) as the label column
        key_col = df.columns[0] if len(df.columns) > 0 else None
        col_matches = [c for c in df.columns if str(c) in allowed_cols]
        # Prepend key_col if it's not already requested
        if key_col is not None and key_col not in col_matches:
            col_matches = [key_col] + col_matches
        # Apply selection preserving order
        if col_matches:
            df = df[[c for c in df.columns if c in col_matches]]

    print(f"Columns after filtering: {len(df.columns)}")

    # --- sample averaging / splitting behavior ---
    # Only act when 'sample' is used as one of the axes
    if row_type == "sample" or column_type == "sample":
        # read sample spec and normalize 'average'
        sample_spec = specs.get("sample", {}) if isinstance(specs, dict) else {}
        avg_spec = sample_spec.get("average", False)
        if isinstance(avg_spec, str):
            aval = avg_spec.strip().lower()
            if aval in ("false", "none"):
                avg_spec = False
            elif aval in ("time", "place"):
                avg_spec = aval
            else:
                avg_spec = False

        # Helper to split a sample-key string into (place, time)
        def split_key(s: str):
            s = str(s)
            return s[0:3], s[3:8]

        # CASE: sample is in rows (first column)
        if row_type == "sample":
            key_col = df.columns[0] if len(df.columns) > 0 else None
            if key_col is None:
                csv_bytes = df.to_csv(index=False).encode("utf-8")
                return Response(content=csv_bytes, media_type="text/csv")
            data_cols = list(df.columns[1:])
            # compute place/time parts
            s_keys = df[key_col].astype(str)
            places = s_keys.apply(lambda x: split_key(x)[0])
            times = s_keys.apply(lambda x: split_key(x)[1])

            # Priority 1: if avg_spec requests averaging, do it (regardless of other axis size)
            if avg_spec in ("time", "place"):
                # convert data columns to numeric where appropriate
                for c in data_cols:
                    df[c] = pd.to_numeric(df[c], errors="coerce")
                working = df.copy()
                working["__place"] = places
                working["__time"] = times
                if avg_spec == "time":
                    # average over time -> group by place (remaining axis = place)
                    grouped = working.groupby("__place")[data_cols].mean()
                    res = grouped
                else:
                    # average over place -> group by time (remaining axis = time)
                    grouped = working.groupby("__time")[data_cols].mean()
                    res = grouped
                # build axis metadata: sample was averaged -> remaining axis is the grouping key
                out_row_type = "place" if avg_spec == "time" else "time"
                out_col_type = column_type
                # prepare response CSV and axis values
                resp_df = grouped.reset_index()
                csv_str = resp_df.to_csv(index=False)
                payload = {
                    "csv": csv_str,
                    "axis": [out_row_type, out_col_type]
                }
                return Response(content=json.dumps(payload), media_type="application/json")

            # Priority 2: if avg_spec is False and other axis only has 1 data column, split/pivot to use unused dimension
            if not avg_spec and len(data_cols) == 1:
                val_col = data_cols[0]
                pivot = df.copy()
                pivot["__place"] = places
                pivot["__time"] = times
                pivot[val_col] = pd.to_numeric(pivot[val_col], errors="coerce")
                pt = pivot.pivot_table(index="__time", columns="__place", values=val_col, aggfunc="first")
                pt.index = pt.index.astype(str)
                pt.columns = pt.columns.astype(str)
                # pivot produced time x place table
                resp_df = pt.reset_index()
                csv_str = resp_df.to_csv(index=False)
                payload = {
                    "csv": csv_str,
                    "axis": ["time", "place"]
                }
                return Response(content=json.dumps(payload), media_type="application/json")

            # otherwise, no special sample splitting/averaging — fall through to return filtered CSV

    # Default: return filtered CSV (do not write pandas index so original first column remains first)
    # Prepare axis metadata reflecting current df layout
    # If df has a meaningful index (not RangeIndex), treat index as row labels; otherwise use first column as row labels
    # Always return CSV without pandas index column. Ensure any meaningful index becomes a column.
    resp_df = df.reset_index(drop=True)
    csv_str = resp_df.to_csv(index=False)
    out_row_type = row_type
    out_col_type = column_type

    payload = {
        "csv": csv_str,
        "axis": [out_row_type, out_col_type]
    }
    return Response(content=json.dumps(payload), media_type="application/json")
