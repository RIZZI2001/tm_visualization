from fastapi import FastAPI, HTTPException, Query
import pandas as pd
from pathlib import Path
from typing import Optional, Any, Dict
from fastapi import Response
import json
from typing import List
try:
	# when imported as package (uvicorn server.api:app)
	from .helper_functions import generateSampleKeys
except Exception:
	# when run directly (python server/api.py)
	from helper_functions import generateSampleKeys

axis_types = {
    "metadata": {"column": "attribute", "row": "sample"},
    "topic": {"column": "topic", "row": "sample"},
    "component": {"column": "otu", "row": "topic"},
    "otu": {"column": "otu", "row": "sample"},
    "taxonomy": {"column": "attribute", "row": "otu"},
}

app = FastAPI(title="CSV Query API")

# Base directory (repository root)
BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "server/DATA"

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

	samplekeys = []
	if(row_type == "sample" or column_type == "sample"):
		specs = payload.get("specs", {})
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
	specs = payload.get("specs", {})
	allowed_rows = allowed_for_axis(row_type)
	allowed_cols = allowed_for_axis(column_type)

	# Convert allowed lists to strings
	if allowed_rows is not None:
		allowed_rows = [str(x) for x in allowed_rows]
	if allowed_cols is not None:
		allowed_cols = [str(x) for x in allowed_cols]

	print(f"Filtering rows ({row_type}): {allowed_rows if allowed_rows else 'none'}")
	print(f"Filtering columns ({column_type}): {allowed_cols if allowed_cols else 'none'}")

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

	# Return filtered CSV (do not write pandas index so original first column remains first)
	csv_bytes = df.to_csv(index=False).encode("utf-8")
	return Response(content=csv_bytes, media_type="text/csv")

