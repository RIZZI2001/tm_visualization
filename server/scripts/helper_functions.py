import ast
import json
from typing import List
from datetime import datetime, date
import pandas as pd
from fastapi import HTTPException
from pathlib import Path

# DATA_DIR is repo_root / "server/DATA"
# `parents[1]` is the `server` folder, so join with "DATA" (avoid duplicate 'server/server')
DATA_DIR = Path(__file__).resolve().parents[1] / "DATA"

def date_to_week_year(dt: date) -> tuple:
	"""Convert a date to (year, week, day) where:
	- year is the full year (e.g., 2023)
	- week is the ISO week number (1-53)
	- day is 'X', 'M', or 'T' (day of week marker)
	"""
	if isinstance(dt, str):
		# Parse DD-MM-YYYY format
		try:
			dt = datetime.strptime(dt, "%d-%m-%Y").date()
		except ValueError:
			raise HTTPException(status_code=400, detail="Invalid date format; expected DD-MM-YYYY")
	elif isinstance(dt, datetime):
		dt = dt.date()
	
	# Get ISO calendar (year, week, weekday)
	# ISO weekday: 1=Monday, 7=Sunday
	iso_year, iso_week, iso_weekday = dt.isocalendar()
	
	# Map ISO weekday to day marker: assuming X=weekend, M=Monday-Friday, T=?
	# Based on sample format, need to clarify but assuming:
	# X = any day, M = specific, T = specific
	# For now, use X for all (can be refined based on actual requirements)
	day_marker = 'X'  # Default
	
	return iso_year, iso_week, day_marker

def generateSampleKeys(sample_input, data_set) -> List[dict]:
	"""Generate sample keys by filtering metadata.csv based on date range and location_id.

	`sample_input` may be a dict or a JSON string (the function will handle both).
	
	Returns a list of dictionaries with keys 'key', 'location_id', and 'date'.
	
	Time specification format: {"from": "DD-MM-YYYY", "to": "DD-MM-YYYY"}
	"""
	# Accept JSON string or dict
	if isinstance(sample_input, str):
		try:
			sample = json.loads(sample_input)
		except Exception:
			raise HTTPException(status_code=400, detail="Invalid JSON for 'sample' parameter")
	elif isinstance(sample_input, dict):
		sample = sample_input
	else:
		raise HTTPException(status_code=400, detail="'sample' must be a JSON string or object")

	# Time handling - parse date range
	time_spec = sample.get("time", {})
	from_date_input = time_spec.get("from")
	to_date_input = time_spec.get("to")
	
	if not from_date_input or not to_date_input:
		raise HTTPException(status_code=400, detail="'from' and 'to' dates are required in time specification")
	
	# Parse dates in DD-MM-YYYY format
	if isinstance(from_date_input, str):
		try:
			from_date = datetime.strptime(from_date_input, "%d-%m-%Y").date()
		except ValueError:
			raise HTTPException(status_code=400, detail="Invalid 'from' date format; expected DD-MM-YYYY")
	elif isinstance(from_date_input, datetime):
		from_date = from_date_input.date()
	else:
		raise HTTPException(status_code=400, detail="'from' must be a string or datetime")
	
	if isinstance(to_date_input, str):
		try:
			to_date = datetime.strptime(to_date_input, "%d-%m-%Y").date()
		except ValueError:
			raise HTTPException(status_code=400, detail="Invalid 'to' date format; expected DD-MM-YYYY")
	elif isinstance(to_date_input, datetime):
		to_date = to_date_input.date()
	else:
		raise HTTPException(status_code=400, detail="'to' must be a string or datetime")
	
	# Place handling - get site_ids
	place = sample.get("place", {})
	place_type = place.get("place_type", "site")

	sites_path = DATA_DIR / "Input" / data_set / "sites.csv"
	sites_df = pd.read_csv(sites_path)
	# Parse lat/lon if needed
	if "rough_lat_long" in sites_df.columns:
		sites_df["latlon"] = sites_df["rough_lat_long"].apply(lambda s: ast.literal_eval(s))

	site_ids: List[int] = []

	if place_type == "site":
		site_section = place.get("site", {})
		stype = site_section.get("type", "all")
		vals = site_section.get("value", [])

		if stype == "all":
			site_ids = sites_df["location_id"].astype(int).tolist()
		elif stype == "single":
			if isinstance(vals, list):
				site_ids = [int(vals[0])] if vals else []
			else:
				site_ids = [int(vals)]
		elif stype == "range":
			start, end = int(vals[0]), int(vals[1])
			site_ids = list(range(start, end + 1))
		elif stype == "list":
			site_ids = [int(v) for v in vals]
		else:
			site_ids = sites_df["location_id"].astype(int).tolist()
	else:
		# latlong filtering
		lat_spec = place.get("latitude", {})
		lon_spec = place.get("longitude", {})

		def spec_range(s):
			st = s.get("type", "all")
			vals = s.get("value", [])
			if st == "all":
				return None
			if st == "range" and len(vals) >= 2:
				return (float(vals[0]), float(vals[1]))
			return None

		lat_r = spec_range(lat_spec)
		lon_r = spec_range(lon_spec)

		mask = pd.Series([True] * len(sites_df))
		if lat_r is not None:
			mask = mask & sites_df["latlon"].apply(lambda ll: lat_r[0] <= float(ll[0]) <= lat_r[1])
		if lon_r is not None:
			mask = mask & sites_df["latlon"].apply(lambda ll: lon_r[0] <= float(ll[1]) <= lon_r[1])

		site_ids = sites_df.loc[mask, "location_id"].astype(int).tolist()

	# Read metadata.csv and filter by date and location_id
	metadata_path = DATA_DIR / "Input" / data_set / "metadata.csv"
	metadata_df = pd.read_csv(metadata_path)

	# Filter by location_id and date
	metadata_df["location_id"] = metadata_df["location_id"].astype(int)
	filtered_df = metadata_df[metadata_df["location_id"].isin(site_ids)].copy()
	
	# Parse dates and filter by date range
	filtered_df["date"] = pd.to_datetime(filtered_df["date"], format="%Y-%m-%d", errors='coerce')
	filtered_df = filtered_df[(filtered_df["date"].dt.date >= from_date) & 
	                           (filtered_df["date"].dt.date <= to_date)]
	
	# Build result preserving site_ids order, returning dicts with key, location_id, and date
	result: List[dict] = []
	for site_id in site_ids:
		site_data = filtered_df[filtered_df["location_id"] == site_id]
		for _, row in site_data.iterrows():
			result.append({
				'key': str(row.iloc[0]),
				'location_id': str(row['location_id']),
				'date': str(row['date'][:10]) if hasattr(row['date'], '__getitem__') else str(row['date']).split(' ')[0]
			})
	return result