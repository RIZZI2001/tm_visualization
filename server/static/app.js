// Minimal frontend: fetch topics 1..11 and show raw CSVs
(async function(){
  const API = '/data';
  const root = document.getElementById('chart') || document.body;

  const payload = {
    "file": "Input/metadata.csv",
    "table_type": "metadata",
    "specs": {
        "sample": {
            "time": {
                "type": "all",
                "year": [],
                "week": []},
                "day": "all",
            "place": {
                "place_type": "site",
                "site": {
                    "type": "range",
                    "value": [2, 15]
                },
                "latitude": {
                    "type": "range",
                    "value": [53.0, 55.0]
                },
                "longitude": {
                    "type": "range",
                    "value": [11.0, 13.0]
                }
            },
            "average": "false"
        },
        "attribute": {
            "type": "list",
            "value": ["f0"]
        },

    }
};

    // Simple CSV visualizer: parses CSV text and appends a labeled table to `root`.
    function visualizeCSV(rootEl, csvText){
        // Try to parse CSV using d3 (handles quoted fields)
        const txt = String(csvText || '').trim();
        const container = document.createElement('div');
        container.style.margin = '8px 0';
        rootEl.appendChild(container);
        if(!txt){ container.textContent = 'Empty CSV'; return; }
        if(txt.startsWith('Error')){ container.textContent = txt; return; }

        const rows = d3.csvParse(txt);
        const cols = rows.columns;
        if(!cols || cols.length < 2){ container.textContent = 'Unexpected CSV format'; return; }

        // helper: parse encoded time token
        function parseTimeLabelToken(s){
            const str = String(s||'');
            return {
                token: str,
                day: str.charAt(0)||'',
                week: parseInt(str.slice(1,3)||'0',10)||0,
                year: parseInt(str.slice(3,5)||'0',10)||0,
                dayOrd: ({'M':0,'X':1,'T':2}[str.charAt(0)] ?? 3)
            };
        }

        function decodeTimeLabel(label){
            if(!label) return null;
            const s = String(label);
            const dayChar = s.charAt(0) || 'M';
            const week = parseInt(s.slice(1,3) || '0', 10) || 0;
            const year2 = parseInt(s.slice(3,5) || '0', 10) || 0;
            const year = 2000 + year2;
            const dayMap = { 'M': 1, 'T': 4, 'X': 1 };
            const isoWeekday = dayMap[dayChar] || 1;

            const jan4 = new Date(Date.UTC(year, 0, 4));
            const jan4Day = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
            const mon1 = new Date(Date.UTC(year, 0, 4));
            mon1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

            const days = (week - 1) * 7 + (isoWeekday - 1);
            const target = new Date(mon1);
            target.setUTCDate(mon1.getUTCDate() + days);

            const Y = target.getUTCFullYear();
            const M = String(target.getUTCMonth() + 1).padStart(2, '0');
            const D = String(target.getUTCDate()).padStart(2, '0');
            return `${Y}-${M}-${D}`;
        }

        // Determine whether time labels are in rows or columns
        const axis = Array.isArray(arguments[2]) ? arguments[2] : null;
        const timeInRows = axis ? (axis[0] === 'time' || axis[0] === 'sample') : true;
        const timeInCols = axis ? (axis[1] === 'time' || axis[1] === 'sample') : false;
        const axisPos = timeInRows ? 0 : 1;

        let timeKeys = [];
        let placeKeys = [];
        let rowKey = cols[0];

        if(timeInRows){
            // rows contain time/sample tokens; columns (after first) are places
            rowKey = cols[0];
            placeKeys = cols.slice(1);
            timeKeys = Array.from(new Set(rows.map(r => r[rowKey])));
        } else if(timeInCols){
            // columns (after first) are time tokens; rows' first column are places
            placeKeys = rows.map(r => r[cols[0]]);
            timeKeys = cols.slice(1);
        } else {
            // fallback: assume time in rows
            rowKey = cols[0];
            placeKeys = cols.slice(1);
            timeKeys = Array.from(new Set(rows.map(r => r[rowKey])));
        }

        // produce display labels for time tokens based on axis type
        const displayLabel = (token, axisPos) => {
            if(!token) return '';
            const axisType = axis ? axis[axisPos] : 'time';
            if(axisType === 'time'){
                return decodeTimeLabel(token);
            }
            if(axisType === 'sample'){
                const prefix = String(token).slice(0,3);
                const tpart = String(token).slice(3,8);
                const dec = decodeTimeLabel(tpart);
                return prefix + '-' + (dec || tpart);
            }
            return token;
        };

        // build decoded label map and sorting
        const tokens = Array.from(new Set(timeKeys));
        // compute display labels and sort by the display label lexicographically
        const parsed = tokens.map(t => ({ t, display: String(displayLabel(t, axisPos) || '') }));
        parsed.sort((a,b) => a.display.localeCompare(b.display));
        const timeSorted = parsed.map(p => p.t);

        // build matrix: rows=places, cols=times
        const matrix = placeKeys.map(place => ({ place, vals: timeSorted.map(tk => {
            if(timeInRows){
                const r = rows.find(rr => String(rr[rowKey]) === String(tk));
                if(!r) return NaN; const v = r[place]; const n = (v==null||v==='')?NaN:+v; return isNaN(n)?NaN:n;
            } else {
                // time in columns: find the row for this place
                const r = rows.find(rr => String(rr[cols[0]]) === String(place));
                if(!r) return NaN; const v = r[tk]; const n = (v==null||v==='')?NaN:+v; return isNaN(n)?NaN:n;
            }
        }) }));

        // domain
        let vmin = Infinity, vmax = -Infinity;
        matrix.forEach(m=>m.vals.forEach(v=>{ if(!isNaN(v)){ vmin = Math.min(vmin,v); vmax = Math.max(vmax,v); }}));
        if(vmin===Infinity){ vmin=0; vmax=1; }

        // layout
        const cell = 15;
        const margin = { top: 80, right: 10, bottom: 100, left: 120 };
        const nCols = timeSorted.length, nRows = matrix.length;
        const width = Math.max(300, nCols*cell) + margin.left + margin.right;
        const height = Math.max(120, nRows*cell) + margin.top + margin.bottom;

        container.innerHTML = '';
        const svg = d3.create('svg').attr('width', width).attr('height', height);
        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        const x = d3.scaleBand().domain(timeSorted).rangeRound([0, nCols*cell]).padding(0);
        const y = d3.scaleBand().domain(matrix.map(d=>d.place)).rangeRound([0, nRows*cell]).padding(0);
        const color = d3.scaleSequential(d3.interpolateViridis).domain([vmin,vmax]);

        // cells
        const rowsG = g.append('g');
        // tooltip
        d3.selectAll('.tooltip').remove();
        const tooltipDiv = d3.select('body').append('div').attr('class','tooltip').style('display','none');

        // determine viz axis types: rows in visualization are places, cols are times
        let vizRowType, vizColType;
        if(axis){
            if(timeInRows){ vizRowType = axis[1]; vizColType = axis[0]; }
            else { vizRowType = axis[0]; vizColType = axis[1]; }
        } else {
            vizRowType = 'place'; vizColType = 'time';
        }
        matrix.forEach((row,i)=>{
                row.vals.forEach((v,j)=>{
                                const tk = timeSorted[j];
                                const cell = rowsG.append('rect')
                                        .attr('x', x(tk)).attr('y', y(row.place))
                                        .attr('width', x.bandwidth()).attr('height', y.bandwidth())
                                        .style('fill', isNaN(v) ? '#f7f7f7' : color(v))
                                        .style('stroke','none');

                                cell.on('mousemove', (e)=>{
                                    const pageX = e.pageX, pageY = e.pageY;
                                    // compute axis values for this cell
                                    const rowValRaw = row.place;
                                    const colValRaw = tk;
                                    function fmt(type, raw){
                                        if(type === 'time') return decodeTimeLabel(raw) || raw;
                                        if(type === 'sample'){
                                            const prefix = String(raw).slice(0,3);
                                            const tpart = String(raw).slice(3,8);
                                            const dec = decodeTimeLabel(tpart);
                                            return prefix + '-' + (dec || tpart);
                                        }
                                        return String(raw);
                                    }
                                    const rowLabel = fmt(vizRowType, rowValRaw);
                                    const colLabel = fmt(vizColType, colValRaw);
                                    const valLabel = isNaN(v) ? 'NA' : v;
                                    tooltipDiv.style('display','block')
                                        .style('left', (pageX + 10) + 'px')
                                        .style('top', (pageY + 10) + 'px')
                                        .html(`<b>${vizRowType}:</b> ${rowLabel}<br/><b>${vizColType}:</b> ${colLabel}<br/><b>value:</b> ${valLabel}`);
                                }).on('mouseout', ()=> tooltipDiv.style('display','none'));
                        });
        });

        // x labels (times) - place below the heatmap so rotated labels don't climb out of view
        const xg = svg.append('g').attr('transform', `translate(${margin.left},${margin.top + nRows*cell + 6})`);
        xg.selectAll('text').data(timeSorted).join('text')
            .text(d=>displayLabel(d, axisPos))
            .attr('transform', d=>`translate(${x(d)+x.bandwidth()/2},0) rotate(-65)`)
            .style('text-anchor','end').style('font-size','10px');

        // y labels (places)
        const yg = svg.append('g').attr('transform', `translate(${margin.left-6},${margin.top})`);
        yg.selectAll('text').data(matrix.map(d=>d.place)).join('text')
            .text(d=>d)
            .attr('x', 0)
            .attr('y', d=>y(d)+y.bandwidth()/2)
            .attr('dy','0.35em')
            .style('text-anchor','end').style('font-size','11px');

        // simple legend (moved further down to avoid overlapping rotated x labels)
        const legendW = 160, legendH = 8;
        const legend = svg.append('g').attr('transform', `translate(${margin.left},${margin.top + nRows*cell + 60})`);
        const defs = svg.append('defs');
        const gid = 'lg';
        const lg = defs.append('linearGradient').attr('id', gid).attr('x1','0%').attr('x2','100%');
        for(let i=0;i<=8;i++){ const t=i/8; lg.append('stop').attr('offset', `${t*100}%`).attr('stop-color', d3.interpolateViridis(t)); }
        legend.append('rect').attr('width', legendW).attr('height', legendH).style('fill', `url(#${gid})`);
        legend.append('text').text(vmin.toFixed(2)).attr('x',0).attr('y',legendH+12).style('font-size','10px');
        legend.append('text').text(vmax.toFixed(2)).attr('x',legendW).attr('y',legendH+12).style('font-size','10px').attr('text-anchor','end');

        container.appendChild(svg.node());
    }

  async function fetchCSV(){
    const q = encodeURIComponent(JSON.stringify(payload));
    const res = await fetch(`${API}?attribute=${q}`);
        const ct = res.headers.get('content-type') || '';
        if(ct.includes('application/json')){
            const j = await res.json();
            // API returns { csv: '...', axis: {...} }
            return { csv: j.csv || '', axis: j.axis || null };
        }
        const text = await res.text();
        return { csv: text, axis: null };
  }

  try{
        const resp = await fetchCSV();
        console.log('Axis metadata from /data:', resp.axis);
        console.log('CSV dimensions: rows=', resp.csv.split('\n').length, 'cols=', (resp.csv.split('\n')[0]||'').split(',').length);
        visualizeCSV(root, resp ? resp.csv : '', resp ? resp.axis : null);
  }catch(e){ console.error(e); }

})();
