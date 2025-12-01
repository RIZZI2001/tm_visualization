(async function(){
  const API = '/data';
  const root = document.getElementById('chart') || document.body;

  const payload = {
    "file": "Output/16s/TM_Topics/20_topics.csv",
    "table_type": "topic",
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
            "value": ["temperature"]
        },
        "otu": {
            "type": "list",
            "prefix": "otu_16s_",
            "value": [2, 3, 1]
        },
        "topic": {
            "type": "single",
            "value": [5]
        }
    }
};

    // Simple CSV visualizer: parses CSV text and appends a labeled table to `root`.
    function visualizeCSV(rootEl, resp){
        // Try to parse CSV using d3 (handles quoted fields)
        const txt = String(resp.csv || '').trim();
        const container = document.createElement('div');
        container.style.margin = '8px 0';
        rootEl.appendChild(container);
        if(!txt){ container.textContent = 'Empty CSV'; return; }
        if(txt.startsWith('Error')){ container.textContent = txt; return; }

        const rows = d3.csvParse(txt);
        const cols = rows.columns;
        if(!cols || cols.length < 2){ container.textContent = 'Unexpected CSV format'; return; }

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

        const displayLabel = (token, axisPos) => {
            if(!token) return '';
            const axis = Array.isArray(resp && resp.axis) ? resp.axis : null;
            const axisType = (axis[axisPos] === 'time' || axis[axisPos] === 'sample') ? axis[axisPos] : null;
            if(axisType === 'time'){
                return decodeTimeLabel(token);
            }
            if(axisType === 'sample'){
                const prefix = String(token).slice(0,3);
                const tpart = String(token).slice(3,8);
                const dec = decodeTimeLabel(tpart);
                return prefix + ':' + (dec || tpart);
            }
            return token;
        };

        const rows2 = d3.csvParseRows(txt);
        if(!rows2 || rows2.length < 2 || rows2[0].length < 2){ container.textContent = 'Unexpected CSV format'; return; }

        const nRows = rows2.length - 1; // data rows
        const nCols = rows2[0].length - 1; // data cols

        // parse numeric matrix and compute domain
        const matrix = [];
        const vals = [];
        for(let r=1;r<rows2.length;r++){
            const row = [];
            for(let c=1;c<rows2[r].length;c++){
                const v = parseFloat(rows2[r][c]);
                row.push(v);
                if(!isNaN(v)) vals.push(v);
            }
            matrix.push(row);
        }
        const vmin = vals.length ? Math.min(...vals) : 0;
        const vmax = vals.length ? Math.max(...vals) : 1;

        // layout sizes
        const cell = Math.max(15, Math.min(32, Math.floor(600 / Math.max(nCols, nRows))));
        const leftLabelWidth = 120;
        const topLabelHeight = 60;
        const legendHeight = 12;

        const svgW = leftLabelWidth + nCols * cell + 40;
        const svgH = topLabelHeight + nRows * cell + 60;

        const svg = d3.create('svg')
            .attr('width', svgW)
            .attr('height', svgH)
            .style('font-family', 'Arial, Helvetica, sans-serif')
            .style('font-size', '11px');

        // color scale
        const color = d3.scaleSequential(d3.interpolateViridis).domain([vmin, vmax]);

        // column labels (from first row)
        const colLabels = rows2[0].slice(1).map(d => displayLabel(d, 1));
        // row labels (from first column)
        const rowLabels = rows2.slice(1).map(r => displayLabel(r[0], 0));

        // NOTE: column labels are created after the cells so they render on top

        // row labels
        const rowG = svg.append('g').attr('transform', `translate(${leftLabelWidth - 6}, ${topLabelHeight})`);
        rowG.selectAll('text').data(rowLabels).enter().append('text')
            .attr('x', 0)
            .attr('y', (_,i) => i * cell + cell/2)
            .attr('text-anchor', 'end')
            .attr('dominant-baseline', 'middle')
            .text(d => d)
            .style('font-weight','600');

        // column label group (rotate each label around its own center) - appended after cells so labels are on top
        const colG = svg.append('g').attr('transform', `translate(${leftLabelWidth}, ${topLabelHeight})`);
        colG.selectAll('text').data(colLabels).enter().append('text')
            .attr('x', (_,i) => i * cell + cell/2)
            .attr('y', -5)
            .attr('text-anchor', 'start')
            .attr('dominant-baseline', 'middle')
            .attr('transform', (_,i) => `rotate(-90, ${i*cell + cell/2}, ${-5})`)
            .text(d => d)
            .style('font-weight','600');

        // cells
        const cellsG = svg.append('g').attr('transform', `translate(${leftLabelWidth}, ${topLabelHeight})`);
        const rowsSel = cellsG.selectAll('g.row').data(matrix).enter().append('g').attr('class','row')
            .attr('transform', (_,i) => `translate(0, ${i*cell})`);
        rowsSel.selectAll('rect').data(d => d).enter().append('rect')
            .attr('x', (_,i) => i * cell)
            .attr('y', 0)
            .attr('width', cell)
            .attr('height', cell)
            .attr('fill', d => (!isNaN(d) ? color(d) : '#707070ff'));

        // legend
        const defs = svg.append('defs');
        const gid = 'lg1';
        const grad = defs.append('linearGradient').attr('id', gid).attr('x1','0%').attr('x2','100%');
        // sample stops
        const stops = 8;
        for(let i=0;i<=stops;i++){
            const t = i / stops;
            grad.append('stop')
                .attr('offset', `${t*100}%`)
                .attr('stop-color', color(vmin + t*(vmax - vmin)));
        }

        const legendW = Math.min(300, nCols * cell);
        const legendX = leftLabelWidth;
        const legendY = topLabelHeight + nRows * cell + 18;

        svg.append('rect')
            .attr('x', legendX)
            .attr('y', legendY)
            .attr('width', legendW)
            .attr('height', legendHeight)
            .attr('fill', `url(#${gid})`)
            .attr('stroke', '#999');

        // legend axis ticks
        const legendScale = d3.scaleLinear().domain([vmin, vmax]).range([0, legendW]);
        const ticks = svg.append('g').attr('transform', `translate(${legendX}, ${legendY + legendHeight + 2})`);
        const tickVals = legendScale.ticks(5);
        ticks.selectAll('text').data(tickVals).enter().append('text')
            .attr('x', d => legendScale(d))
            .attr('y', 10)
            .attr('text-anchor','middle')
            .text(d => Math.round(d*1000)/1000);

        container.appendChild(svg.node());

    }

    async function fetchCSV(){
        const q = encodeURIComponent(JSON.stringify(payload));
        const res = await fetch(`${API}?attribute=${q}`);
        const ct = res.headers.get('content-type') || '';
        if(ct.includes('application/json')){
            const j = await res.json();
            return { csv: j.csv || '', axis: j.axis || null };
        }
        const text = await res.text();
        return { csv: text, axis: null };
    }

    try{
        const resp = await fetchCSV();
        console.log('Axis metadata from /data:', resp.axis);
        console.log('CSV dimensions: rows=', resp.csv.split('\n').length, 'cols=', (resp.csv.split('\n')[0]||'').split(',').length);
        console.log('CSV preview:\n', resp.csv);
        visualizeCSV(root, resp);
    }catch(e){ console.error(e); }

})();
