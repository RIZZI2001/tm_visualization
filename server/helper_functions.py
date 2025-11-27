import ast
import json
from typing import List
import pandas as pd
from fastapi import HTTPException
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "server/DATA"

def generateSampleKeys(sample_input) -> List[str]:
	"""Generate sample keys `s<site_id>X<WWYY>` from the provided sample spec.

	`sample_input` may be a dict or a JSON string (the function will handle both).
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

	# Time handling
	time_spec = sample.get("time", {})
	ttype = time_spec.get("type", "single")
	years_vals = time_spec.get("year", [])
	weeks_vals = time_spec.get("week", [])

	DEFAULT_ALL_YEARS = [2022, 2023]
	DEFAULT_ALL_WEEKS = [17, 20]

	if ttype == "all":
		years_vals = DEFAULT_ALL_YEARS
		weeks_vals = DEFAULT_ALL_WEEKS

	times_array: List[str] = []
	if ttype == "single":
		years = [int(years_vals[0])] if years_vals else []
		weeks = [int(weeks_vals[0])] if weeks_vals else []
		for y in years:
			ystr = str(y)[-2:]
			for w in weeks:
				times_array.append(f"{int(w):02d}{ystr}")
	else:
		# range behavior: walk from (start_week, start_year) to (end_week, end_year) inclusive
		if len(years_vals) >= 2:
			start_year = int(years_vals[0])
			end_year = int(years_vals[1])
		elif len(years_vals) == 1:
			start_year = end_year = int(years_vals[0])
		else:
			raise HTTPException(status_code=400, detail="'year' must be provided for range time type")

		if len(weeks_vals) >= 2:
			start_week = int(weeks_vals[0])
			end_week = int(weeks_vals[1])
		elif len(weeks_vals) == 1:
			start_week = end_week = int(weeks_vals[0])
		else:
			raise HTTPException(status_code=400, detail="'week' must be provided for range time type")

		if end_year < start_year:
			raise HTTPException(status_code=400, detail="'year' range end must be >= start")

		# Validate week numbers
		if not (1 <= start_week <= 53 and 1 <= end_week <= 53):
			raise HTTPException(status_code=400, detail="week values must be between 1 and 53")

		y = start_year
		w = start_week
		while True:
			times_array.append(f"{int(w):02d}{str(y)[-2:]}")
			if y == end_year and w == end_week:
				break
			w += 1
			if w > 53:
				w = 1
				y += 1

	# Place handling
	place = sample.get("place", {})
	place_type = place.get("place_type", "site")

	sites_path = DATA_DIR / "Input" / "sites.csv"
	df = pd.read_csv(sites_path)
	# Parse lat/lon
	if "rough_lat_long" in df.columns:
		df["latlon"] = df["rough_lat_long"].apply(lambda s: ast.literal_eval(s))

	site_ids: List[int] = []

	if place_type == "site":
		site_section = place.get("site", {})
		stype = site_section.get("type", "all")
		vals = site_section.get("value", [])

		if stype == "all":
			site_ids = df["location_id"].astype(int).tolist()
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
			site_ids = df["location_id"].astype(int).tolist()
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

		mask = pd.Series([True] * len(df))
		if lat_r is not None:
			mask = mask & df["latlon"].apply(lambda ll: lat_r[0] <= float(ll[0]) <= lat_r[1])
		if lon_r is not None:
			mask = mask & df["latlon"].apply(lambda ll: lon_r[0] <= float(ll[1]) <= lon_r[1])

		site_ids = df.loc[mask, "location_id"].astype(int).tolist()

	# Combine
	result: List[str] = []
	for sid in site_ids:
		for t in times_array:
			result.append(f"s{int(sid):02d}X{t}")

	return result