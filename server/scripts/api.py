from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse, FileResponse
import pandas as pd
from pathlib import Path
from typing import List
from fastapi import Response
import json
try:
    from .helper_functions import generateSampleKeys
except Exception:
    from server.scripts.helper_functions import generateSampleKeys

axis_types = {
    "metadata": {"column": "attribute", "row": "sample"},
    "topic": {"column": "id", "row": "sample"},
    "component": {"column": "otu", "row": "id"},
    "otu": {"column": "otu", "row": "sample"},
    "taxonomy": {"column": "attribute", "row": "otu"},
    "site": {"column": "attribute", "row": "id"},
    "md_top": {"column": "id", "row": "attribute"},
    "top_top": {"row": "id"},
    "md_otu": {"column": "otu", "row": "attribute"},
    "md_md": {"row": "attribute"},
}

app = FastAPI(title="TM VISUALIZER API")

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

@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")

@app.get("/favicon.ico")
def favicon():
    favicon_path = BASE_DIR / "static" / "favicon.ico"
    if favicon_path.is_file():
        return FileResponse(str(favicon_path), media_type="image/x-icon")
    raise HTTPException(status_code=404, detail="favicon not found")

@app.get("/data_sets")
def get_data_sets():
    data_sets_path = DATA_DIR / "Output"
    if not data_sets_path.is_dir():
        raise HTTPException(status_code=404, detail="Data sets directory not found")
    try:
        data_sets = [d.name for d in data_sets_path.iterdir() if d.is_dir()]
        return {"data_sets": data_sets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list data sets: {e}")

@app.get("/taxonomy_levels")
def get_taxonomy_levels(dataSet: str = Query(...)):
    taxonomy_levels_path = DATA_DIR / "Output" / dataSet / "taxonomy_levels.json"
    if not taxonomy_levels_path.is_file():
        raise HTTPException(status_code=404, detail=f"Taxonomy levels file not found for {dataSet}")
    try:
        with open(taxonomy_levels_path, 'r') as f:
            taxonomy_levels_dict = json.load(f)
        return {
            "levels": taxonomy_levels_dict.get("levels", []),
            "dict": taxonomy_levels_dict.get("dict", {})
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read taxonomy levels: {e}")

@app.get("/data")
def get_data(attribute: str = Query(...)):
    # Parse JSON string
    try:
        payload = json.loads(attribute)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON in 'attribute' parameter")

    file_rel = payload.get("file")
    data_set = payload.get("data_set")
    if not isinstance(file_rel, str) or not file_rel:
        raise HTTPException(status_code=400, detail="'file' key must be provided in attribute JSON and be a string")
    
    table_type = payload.get("table_type", "data")
    if table_type not in axis_types.keys():
        raise HTTPException(status_code=400, detail="Invalid 'table_type'. Must be one of: " + ", ".join(axis_types.keys()))
    axis = axis_types.get(table_type)
    row_type = axis["row"]
    #column type is optional
    column_type = axis.get("column") if "column" in axis else None

    specs = payload.get("specs", {})

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
    def allowed_for_axis(axis_name: str, axis_position: str = "column") -> List[str]:
        """
        Extract allowed values for an axis.
        axis_position: "row" means this axis is for row filtering, "column" means column filtering
        """
        specs = payload.get("specs", {})
        # sample handled separately
        if axis_name == "sample":
            sample = specs.get("sample")
            return generateSampleKeys(sample, data_set)
        spec = specs.get(axis_name, {})
        type_ = spec.get("type", "all")

        if axis_name == "id":
            if type_ == "all":
                if axis_position == "row":
                    # When filtering rows by id, look at the first column values
                    ids = df[df.columns[0]].astype(str).unique().tolist()
                    # Try to convert to ints and back to strings for consistency
                    int_ids = []
                    for val in ids:
                        try:
                            int_ids.append(str(int(val)))
                        except Exception:
                            int_ids.append(val)
                    print(f"Identified id rows: {int_ids}")
                    return int_ids
                else:
                    # When filtering columns by id, look at column headers
                    cols = [c for c in df.columns if c is not None]
                    ints = []
                    for c in cols:
                        try:
                            ints.append(str(int(c)))
                        except Exception:
                            continue
                    print(f"Identified id columns: {cols}")
                    return ints
            if type_ == "single":
                val = spec.get("value")
                if isinstance(val, list):
                    return [val[0]]
                return [val]
            if type_ == "list":
                return [v for v in spec.get("value", [])]
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

        # default: return all (no filtering)
        return list(df.columns)

    # Determine allowed rows and columns
    allowed_rows = None
    allowed_cols = None
    allowed_rows_data = allowed_for_axis(row_type, "row")
    allowed_cols = allowed_for_axis(column_type, "column")

    # If rows are samples, extract keys and build metadata lookup from the returned data
    metadata_lookup = {}
    if row_type == "sample" and allowed_rows_data is not None:
        # allowed_rows_data is a list of dicts with 'key', 'location_id', 'date'
        allowed_rows = [item['key'] for item in allowed_rows_data]
        for item in allowed_rows_data:
            metadata_lookup[item['key']] = {
                'location_id': item['location_id'],
                'date': item['date']
            }
    else:
        allowed_rows = allowed_rows_data

    # Check if id averaging is requested
    id_average = False
    if (row_type == "id" or column_type == "id"):
        id_spec = specs.get("id", {})
        id_average = id_spec.get("average", False)
        if isinstance(id_average, str):
            id_average = id_average.lower() in ('true', '1', 'yes')

    # Check if attribute averaging is requested
    attribute_average = False
    if (row_type == "attribute" or column_type == "attribute"):
        attribute_spec = specs.get("attribute", {})
        attribute_average = attribute_spec.get("average", False)
        if isinstance(attribute_average, str):
            attribute_average = attribute_average.lower() in ('true', '1', 'yes')

    # Check if otu averaging is requested
    otu_average = False
    if (row_type == "otu" or column_type == "otu"):
        otu_spec = specs.get("otu", {})
        otu_average = otu_spec.get("average", False)
        if isinstance(otu_average, str):
            otu_average = otu_average.lower() in ('true', '1', 'yes')

    # Convert allowed lists to strings
    if allowed_rows is not None:
        allowed_rows = [str(x) for x in allowed_rows]
    if allowed_cols is not None:
        allowed_cols = [str(x) for x in allowed_cols]

    # Filter rows: keep rows where the FIRST column value is in allowed_rows
    if allowed_rows is not None and len(allowed_rows) > 0:
        try:
            mask = df[df.columns[0]].astype(str).isin(allowed_rows)
        except Exception:
            mask = [str(v) in allowed_rows for v in df[df.columns[0]]]
        df = df[mask]

        # Reorder rows to match allowed_rows order (important for sample keys)
        if row_type == 'sample':
            key_col = df.columns[0]
            # Create a categorical with the exact order from allowed_rows
            df[key_col] = pd.Categorical(df[key_col], categories=allowed_rows, ordered=True)
            df = df.sort_values(key_col)
            df[key_col] = df[key_col].astype(str)  # Convert back to string

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

    # Handle id averaging if requested
    if id_average:
        key_col = df.columns[0] if len(df.columns) > 0 else None
        
        if row_type == "id" and key_col is not None:
            # Average rows: convert data to numeric, compute mean, replace with single row labeled "-2"
            data_cols = list(df.columns[1:])
            for c in data_cols:
                df[c] = pd.to_numeric(df[c], errors='coerce')
            avg_values = df[data_cols].mean()
            df = pd.DataFrame([["-2"] + avg_values.tolist()], columns=df.columns)
        
        elif column_type == "id":
            # Average columns: convert data to numeric, compute mean across id columns
            data_cols = [c for c in df.columns[1:]]  # All columns except the first (key)
            if len(data_cols) > 1:  # Only if there are multiple id columns to average
                for c in data_cols:
                    df[c] = pd.to_numeric(df[c], errors='coerce')
                key_col = df.columns[0]
                # Compute mean across all id columns for each row
                avg_col = df[data_cols].mean(axis=1)
                df = df[[key_col]].copy()
                df["-2"] = avg_col

    # Handle attribute averaging if requested
    if attribute_average:
        key_col = df.columns[0] if len(df.columns) > 0 else None
        
        if row_type == "attribute" and key_col is not None:
            # Average rows: convert data to numeric, compute mean, replace with single row labeled "-2"
            data_cols = list(df.columns[1:])
            for c in data_cols:
                df[c] = pd.to_numeric(df[c], errors='coerce')
            avg_values = df[data_cols].mean()
            df = pd.DataFrame([["-2"] + avg_values.tolist()], columns=df.columns)
        
        elif column_type == "attribute":
            # Average columns: convert data to numeric, compute mean across attribute columns
            data_cols = [c for c in df.columns[1:]]  # All columns except the first (key)
            if len(data_cols) > 1:  # Only if there are multiple attribute columns to average
                for c in data_cols:
                    df[c] = pd.to_numeric(df[c], errors='coerce')
                key_col = df.columns[0]
                # Compute mean across all attribute columns for each row
                avg_col = df[data_cols].mean(axis=1)
                df = df[[key_col]].copy()
                df["-2"] = avg_col

    # Handle otu averaging if requested
    if otu_average:
        key_col = df.columns[0] if len(df.columns) > 0 else None
        
        if row_type == "otu" and key_col is not None:
            # Average rows: convert data to numeric, compute mean, replace with single row labeled "-2"
            data_cols = list(df.columns[1:])
            for c in data_cols:
                df[c] = pd.to_numeric(df[c], errors='coerce')
            avg_values = df[data_cols].mean()
            df = pd.DataFrame([["-2"] + avg_values.tolist()], columns=df.columns)
        
        elif column_type == "otu":
            # Average columns: convert data to numeric, compute mean across otu columns
            data_cols = [c for c in df.columns[1:]]  # All columns except the first (key)
            if len(data_cols) > 1:  # Only if there are multiple otu columns to average
                for c in data_cols:
                    df[c] = pd.to_numeric(df[c], errors='coerce')
                key_col = df.columns[0]
                # Compute mean across all otu columns for each row
                avg_col = df[data_cols].mean(axis=1)
                df = df[[key_col]].copy()
                df["-2"] = avg_col

    # --- sample handling: relabeling using metadata, optional averaging or pivoting ---
    # Only handle samples when they are the row type. Samples are never used as columns.
    if row_type == 'sample':
        # normalize avg spec
        sample_spec = specs.get('sample', {}) if isinstance(specs, dict) else {}
        avg_spec = sample_spec.get('average', False)
        if isinstance(avg_spec, str):
            aval = avg_spec.strip().lower()
            if aval in ('time', 'place'):
                avg_spec = aval
            else:
                avg_spec = False

        # helper to make display label using cached metadata: location_id:date
        def make_display_label(key: str):
            key_str = str(key)
            if key_str in metadata_lookup:
                loc_id = metadata_lookup[key_str].get('location_id', 'unknown')
                date_val = metadata_lookup[key_str].get('date', 'unknown')
                return f"{loc_id}:{date_val}"
            return key_str

        key_col = df.columns[0] if len(df.columns) > 0 else None
        if key_col is None:
            pass
        else:
            data_cols = list(df.columns[1:])
            s_keys = df[key_col].astype(str)
            display_labels = s_keys.map(lambda s: make_display_label(s))

            # Averaging requested: aggregate numeric data and return grouped result
            if avg_spec in ('time', 'place'):
                # convert data columns to numeric where possible
                for c in data_cols:
                    df[c] = pd.to_numeric(df[c], errors='coerce')
                working = df.copy()
                # convert sample tokens to display labels first, then split
                # into location_id and date for grouping
                display = s_keys.map(lambda s: make_display_label(s))
                working['__place'] = display.map(lambda dl: dl.split(':', 1)[0])
                working['__time'] = display.map(lambda dl: dl.split(':', 1)[1])

                if avg_spec == 'time':
                    # average over time -> group by place (location_id)
                    times_agg = working['__time'].unique().tolist()
                    grouped = working.groupby('__place')[data_cols].mean()
                    # Preserve order of places as they appear in the data
                    place_order = working['__place'].unique()
                    grouped = grouped.reindex(place_order)
                    out_row_type = 'place'
                else:
                    # average over place -> group by time (date)
                    grouped = working.groupby('__time')[data_cols].mean()
                    out_row_type = 'time'
                resp_df = grouped.reset_index()
                csv_str = resp_df.to_csv(index=False)
                payload = { 'csv': csv_str, 'axis': [out_row_type, column_type], 'times' : times_agg if avg_spec == 'time' else None }
                return Response(content=json.dumps(payload), media_type='application/json')

            # If no averaging and data is 1D (only one data column) pivot into time x place
            if not avg_spec and len(data_cols) == 1:
                val_col = data_cols[0]
                pivot = df.copy()
                # convert sample tokens to display labels first, then split
                display = s_keys.map(lambda s: make_display_label(s))
                pivot['__place'] = display.map(lambda dl: dl.split(':', 1)[0])
                pivot['__time'] = display.map(lambda dl: dl.split(':', 1)[1])
                pivot[val_col] = pd.to_numeric(pivot[val_col], errors='coerce')
                pt = pivot.pivot_table(index='__time', columns='__place', values=val_col, aggfunc='first', dropna=False)
                
                place_order = pivot['__place'].unique()
                pt = pt.reindex(columns=place_order)
                
                pt.index = pt.index.astype(str)
                pt.columns = pt.columns.astype(str)
                resp_df = pt.reset_index()
                csv_str = resp_df.to_csv(index=False)
                payload = { 'csv': csv_str, 'axis': ['time', 'place'] }
                return Response(content=json.dumps(payload), media_type='application/json')

            # Otherwise, rewrite the sample labels in-place so frontend sees human-friendly labels
            df[key_col] = display_labels

        # end row_type sample handling

    # end sample handling

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

@app.post("/topic_name")
def set_topic_name(dataSet: str = Query(...), topicSet: str = Query(...), topicID: str = Query(...), topicName: str = Query(...), renameThreshold: float = Query(0.5)):
    """
    Update or delete a custom topic name in the topic-names.json file
    
    Parameters:
    - dataSet: The data set identifier (e.g., "16s", "18s")
    - topicSet: The topic set identifier (e.g., "11", "20")
    - topicID: The topic ID number
    - topicName: The new name for the topic. If empty string or None, delete the entry
    - renameThreshold: The threshold for renaming topics based on correlation values
    """
    topic_names_path = BASE_DIR / "static" / "topic-names.json"
    
    # Load existing topic names
    try:
        with open(topic_names_path, 'r') as f:
            topic_names_file = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, ValueError):
        topic_names_file = {}
    
    # Ensure the data set exists
    if dataSet not in topic_names_file:
        topic_names_file[dataSet] = {}

    
    # Handle special reset commands
    if(topicName == "#resetTopicSet"):
        if topicSet in topic_names_file[dataSet]:
            del topic_names_file[dataSet][topicSet]
    elif(topicName == "#resetDataSet"):
        if dataSet in topic_names_file:
            del topic_names_file[dataSet]
    elif(topicName == "#resetAll"):
        topic_names_file = {}
    else:
        setTopicName(dataSet, topicSet, topicID, topicName, topic_names_file, True, True, renameThreshold)
    
    # Write back to the file
    try:
        with open(topic_names_path, 'w') as f:
            json.dump(topic_names_file, f, indent=2)
        return {"status": "success", "message": f"Topic name updated for {dataSet}.{topicSet}.{topicID}", "topic_names": topic_names_file}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write topic names: {e}")

def setTopicName(dataSet, topicSet, topicID, topicName, topic_names, up=True, down=True, renameThreshold=0.5):
    # Ensure the topic set exists
    if topicSet not in topic_names[dataSet]:
        topic_names[dataSet][topicSet] = {}
    
    # If topicName is empty or None, delete the entry
    if topicName == "" or topicName is None:
        if str(topicID) in topic_names[dataSet][topicSet]:
            del topic_names[dataSet][topicSet][str(topicID)]
            print(f"Deleted topic name for {dataSet}.{topicSet}.{topicID}")
    else:
        # Set the new name
        topic_names[dataSet][topicSet][str(topicID)] = topicName
        print(f"Set topic name for {dataSet}.{topicSet}.{topicID} to '{topicName}'")
    if up:
        path = BASE_DIR / "DATA" / "Output" / dataSet / "Correlation" / "top_top_inter" / f"{int(topicSet)+1}_{topicSet}_inter_top_correlation.csv"
        try:
            with open(path, 'r') as f:
                correlation_values = []
                lines = f.readlines()
                col_index = int(topicID) + 1  # +1 to account for the first column being row labels
                for i in range(1, len(lines)):  # Skip header
                    line = lines[i].strip()
                    values = line.strip().split(',')
                    if len(values) > col_index:
                        correlation_values.append(values[col_index])
            max_corr_idx = None
            if correlation_values:
                max_corr_idx = max(range(len(correlation_values)), key=lambda i: abs(float(correlation_values[i])))
                print(correlation_values[max_corr_idx], renameThreshold)
                if float(correlation_values[max_corr_idx]) >= renameThreshold:
                    setTopicName(dataSet, str(int(topicSet)+1), max_corr_idx, topicName, topic_names, up=True, down=False, renameThreshold=renameThreshold)
        except FileNotFoundError:
            pass
    if down:
        path = BASE_DIR / "DATA" / "Output" / dataSet / "Correlation" / "top_top_inter" / f"{topicSet}_{int(topicSet)-1}_inter_top_correlation.csv"
        try:
            with open(path, 'r') as f:
                correlation_values = []
                lines = f.readlines()
                row_index = int(topicID) + 1  # +1 to account for the first row being row labels
                line = lines[row_index].strip()
                values = line.strip().split(',')
                correlation_values = values[1:]
            max_corr_idx = None
            if correlation_values:
                max_corr_idx = max(range(len(correlation_values)), key=lambda i: abs(float(correlation_values[i])))
                print(correlation_values[max_corr_idx], renameThreshold)
                if float(correlation_values[max_corr_idx]) >= renameThreshold:
                    setTopicName(dataSet, str(int(topicSet)-1), max_corr_idx, topicName, topic_names, up=False, down=True, renameThreshold=renameThreshold)
        except FileNotFoundError:
            pass

@app.post("/save-options")
async def save_options(options: dict):
    specs_path = BASE_DIR / "static" / "frontend-specs.json"
    default_options_path = BASE_DIR / "static" / "default-frontend-specs.json"
    
    try:
        with open(specs_path, 'w') as f:
            #if options in empty json ({})
            if(options == {}):
                with open(default_options_path, 'r') as default_f:
                    default_options = json.load(default_f)
                json.dump(default_options, f, indent=2)
                return {"status": "success", "message": "Options reset to defaults"}
            json.dump(options, f, indent=2)
        return {"status": "success", "message": "Options saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write options: {e}")

