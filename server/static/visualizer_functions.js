// Simple CSV visualizer: parses CSV text and appends a labeled table to `root`.
function visualizeCSV(rootEl, resp, transposed=false, basePayload=null){
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

    // displayLabel: frontend no longer decodes or renames time/sample tokens;
    // backend provides already-decoded labels and sorting.
    const displayLabel = (token, axisPos) => {
        if(token === null || token === undefined) return '';
        return String(token);
    };

    const rows2 = d3.csvParseRows(txt);
    if(!rows2 || rows2.length < 2 || rows2[0].length < 2){ container.textContent = 'Unexpected CSV format'; return; }

    const nRows = rows2.length - 1; // original data rows
    const nCols = rows2[0].length - 1; // original data cols

    // determine axis types and optionally sort by date when axis is 'time' or 'sample'
    const axis = Array.isArray(resp && resp.axis) ? resp.axis : [null, null];

    // No client-side date parsing/sorting — backend performs decoding and ordering.

    // build ordered index arrays for rows and columns
    const colIdxs = [];
    for(let c=1;c<rows2[0].length;c++) colIdxs.push(c);
    // client leaves column order as provided by server

    const rowIdxs = [];
    for(let r=1;r<rows2.length;r++) rowIdxs.push(r);
    // client leaves row order as provided by server

    // parse numeric matrix in the chosen order and compute domain
    const matrix = [];
    const vals = [];
    for(const rIdx of rowIdxs){
        const row = [];
        for(const cIdx of colIdxs){
            const v = parseFloat(rows2[rIdx][cIdx]);
            row.push(v);
            if(!isNaN(v)) vals.push(v);
        }
        matrix.push(row);
    }
    const vmin = vals.length ? Math.min(...vals) : 0;
    const vmax = vals.length ? Math.max(...vals) : 1;

    // prepare display orientation (do not mutate original matrix)
    const colLabels = colIdxs.map(ci => displayLabel(rows2[0][ci], 1));
    const rowLabels = rowIdxs.map(ri => displayLabel(rows2[ri][0], 0));

    const displayRows = transposed ? nCols : nRows;
    const displayCols = transposed ? nRows : nCols;

    // layout sizes based on displayed dimensions
    const cell_AR = (2/3); // cell aspect ratio (width/height)
    const cell_x = Math.max(10, Math.min(32, 600 / Math.max(displayCols, displayRows)));
    const cell_y = cell_x / cell_AR;
    const leftLabelWidth = 120;
    const topLabelHeight = 60;
    const legendHeight = 12;

    const svgW = leftLabelWidth + displayCols * cell_x + 40;
    const svgH = topLabelHeight + displayRows * cell_y + 60;

    const svg = d3.create('svg')
        .attr('width', svgW)
        .attr('height', svgH)
        .attr('shape-rendering', 'crispEdges')
        .style('font-family', 'Arial, Helvetica, sans-serif')
        .style('font-size', '11px');

    // color scale
    const color = d3.scaleSequentialSqrt(d3.interpolateViridis).domain([vmin, vmax]);

    // NOTE: column labels are created after the cells so they render on top
    // choose labels for display orientation
    const displayRowLabels = transposed ? colLabels : rowLabels;
    const displayColLabels = transposed ? rowLabels : colLabels;

    // row labels (for displayed rows)
    const rowG = svg.append('g').attr('transform', `translate(${leftLabelWidth - 6}, ${topLabelHeight})`);
    rowG.selectAll('text').data(displayRowLabels).enter().append('text')
        .attr('x', 0)
        .attr('y', (_,i) => i * cell_y + cell_y/2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .text(d => d)
        .style('font-weight','600');

    // column label group (rotate each label around its own center) - appended after cells so labels are on top
    const colG = svg.append('g').attr('transform', `translate(${leftLabelWidth}, ${topLabelHeight})`);
    colG.selectAll('text').data(displayColLabels).enter().append('text')
        .attr('x', (_,i) => i * cell_x + cell_x/2)
        .attr('y', -5)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'middle')
        .attr('transform', (_,i) => `rotate(-90, ${i*cell_x + cell_x/2}, ${-5})`)
        .text(d => d)
        .style('font-weight','600');

    // cells
    const cellsG = svg.append('g').attr('transform', `translate(${leftLabelWidth}, ${topLabelHeight})`);
    // build displayed matrix view on-the-fly (without mutating original matrix)
    const displayMatrix = [];
    for(let r=0;r<displayRows;r++){
        const row = [];
        for(let c=0;c<displayCols;c++){
            const v = transposed ? matrix[c][r] : matrix[r][c];
            row.push(v);
        }
        displayMatrix.push(row);
    }

    const rowsSel = cellsG.selectAll('g.row').data(displayMatrix).enter().append('g').attr('class','row')
        .attr('transform', (_,i) => `translate(0, ${i*cell_y})`);
    rowsSel.selectAll('rect').data(d => d).enter().append('rect')
        .attr('x', (_,i) => i * cell_x)
        .attr('y', 0)
        .attr('width', cell_x)
        .attr('height', cell_y)
        .attr('fill', d => (!isNaN(d) ? color(d) : '#707070ff'))
        .attr('stroke', 'none');

    // Hover behavior: expand hovered row and shrink others
    const expandFactor = 10;
    const smallFactor = (displayRows - expandFactor) / (displayRows - 1);
    let activeExpanded = null;

    const rowGroups = cellsG.selectAll('g.row');

    function clearExpanded(){
        rowGroups.selectAll('rect').transition().duration(150).attr('height', cell_y).attr('display', null);
        rowGroups.transition().duration(150).attr('transform', (_,i) => `translate(0, ${i*cell_y})`);
        // move y-labels back to their original positions
        rowG.selectAll('text').transition().duration(150).attr('y', (_,i) => i * cell_y + cell_y/2);
        svg.transition().duration(150).attr('height', topLabelHeight + displayRows * cell_y + 60);
        // remove any mini heatmaps inserted into rows
        rowGroups.selectAll('g.mini').remove();
        activeExpanded = null;
    }

    rowGroups.on('mouseenter', function(event, d){
        const nodes = rowGroups.nodes();
        const i = nodes.indexOf(this);
        if(i < 0) return;
        if(activeExpanded === i) return;
        activeExpanded = i;

        const expandedH = cell_y * expandFactor;
        const smallH = Math.max(1, cell_y * smallFactor);

        // compute new y positions
        const heights = [];
        for(let r=0;r<displayRows;r++) heights.push(r===i ? expandedH : smallH);
        const yPos = [];
        let cur = 0;
        for(let r=0;r<displayRows;r++){ yPos.push(cur); cur += heights[r]; }

        // apply new positions and heights
        rowGroups.each(function(_,idx){
            const g = d3.select(this);
            g.transition().duration(150).attr('transform', `translate(0, ${yPos[idx]})`);
            g.selectAll('rect').transition().duration(150).attr('height', heights[idx]);
        });
        // move y-labels together with rows
        rowG.selectAll('text').transition().duration(150).attr('y', (_,idx) => yPos[idx] + heights[idx]/2);

        // resize svg to fit
        const newH = topLabelHeight + cur + 40;
        svg.transition().duration(150).attr('height', newH);

        // restore any previously-hidden underlying rects and remove leftover mini maps
        // before fetching new details, so only one mini map can exist at a time
        rowGroups.selectAll('rect').attr('display', null);
        rowGroups.selectAll('g.mini').remove();

        // fetch detail CSV for this row/topic if basePayload provided
        if(basePayload){
            const topicVal = displayRowLabels[i];
            const payload = JSON.parse(JSON.stringify(basePayload));
            // ensure sample average is false for detail
            if(payload.specs && payload.specs.sample) payload.specs.sample.average = "false";
            // set topic to single
            payload.topic = { type: 'single', value: topicVal };
            // if original structure has specs.topic, mirror it
            if(payload.specs) payload.specs.topic = { type: 'single', value: topicVal };

            const q = encodeURIComponent(JSON.stringify(payload));
            fetch(`/data?attribute=${q}`).then(async res=>{
                const ct = res.headers.get('content-type')||'';
                let txt;
                if(ct.includes('application/json')){ const j = await res.json(); txt = j.csv || ''; }
                else txt = await res.text();
                if(!txt) return;
                // abort if this row is no longer the active expanded row
                if(activeExpanded !== i) return;
                const miniRows = d3.csvParseRows(String(txt).trim());
                if(!miniRows || miniRows.length<2) return;

                // build mini matrix values (time x place: first row times, first column sites)
                const mCols = miniRows[0].length - 1;
                const mRows = miniRows.length - 1;
                if(mCols<=0 || mRows<=0) return;

                const miniVals = [];
                const miniMat = [];
                for(let r=1;r<miniRows.length;r++){
                    const row = [];
                    for(let c=1;c<miniRows[r].length;c++){
                        const v = parseFloat(miniRows[r][c]); row.push(v); if(!isNaN(v)) miniVals.push(v);
                    }
                    miniMat.push(row);
                }
                const mvmin = miniVals.length ? Math.min(...miniVals) : 0;
                const mvmax = miniVals.length ? Math.max(...miniVals) : 1;
                const mcolor = d3.scaleSequential(d3.interpolateInferno).domain([mvmin,mvmax]);

                // compute mini cell sizes to fit into expanded area
                const hoveredGroup = d3.select(rowGroups.nodes()[i]);
                // ensure any mini in hovered group removed (redundant but safe)
                hoveredGroup.selectAll('g.mini').remove();
                // abort if this row is no longer active (may have changed while fetching)
                if(activeExpanded !== i) return;
                // hide the underlying cell rects in the hovered row so the
                // mini-heatmap completely covers the area (avoids visible gaps)
                hoveredGroup.selectAll('rect').attr('display', 'none');
                const miniG = hoveredGroup.append('g').attr('class','mini');

                // if outer heatmap is transposed, keep inner transposed as well
                const innerTransposed = !!transposed;
                const renderCols = innerTransposed ? mRows : mCols;
                const renderRows = innerTransposed ? mCols : mRows;

                const mCellW = Math.max(6, (displayCols * cell_x) / renderCols);
                const mCellH = Math.max(6, (expandedH) / renderRows);

                for(let rr=0; rr<renderRows; rr++){
                    for(let cc=0; cc<renderCols; cc++){
                        // pick value depending on inner transposition
                        const val = innerTransposed ? miniMat[cc][rr] : miniMat[rr][cc];
                        miniG.append('rect')
                            .attr('x', cc * mCellW)
                            .attr('y', rr * mCellH)
                            .attr('width', mCellW)
                            .attr('height', mCellH)
                            .attr('fill', (!isNaN(val) ? mcolor(val) : '#707070ff'));
                    }
                }

            }).catch(()=>{});
        }
    });

    // when leaving a specific row, revert expansion if that row was active
    rowGroups.on('mouseleave', function(event){
        const nodes = rowGroups.nodes();
        const i = nodes.indexOf(this);
        if(i < 0) return;
        // only clear if leaving the currently expanded row
        if(activeExpanded === i){
            clearExpanded();
        }
    });

    // when mouse leaves the whole cells area, clear expanded view
    cellsG.on('mouseleave', function(){ clearExpanded(); });

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

    const legendW = Math.min(300, displayCols * cell_x);
    const legendX = leftLabelWidth;
    const legendY = topLabelHeight + displayRows * cell_y + 18;

    svg.append('rect')
        .attr('x', legendX)
        .attr('y', legendY)
        .attr('width', legendW)
        .attr('height', legendHeight)
        .attr('fill', `url(#${gid})`)
        .attr('stroke', '#999');

    // legend axis ticks
    const legendScale = d3.scaleSequentialSqrt()
        .domain([vmin, vmax])
        .range([0, legendW]);
    const ticks = svg.append('g').attr('transform', `translate(${legendX}, ${legendY + legendHeight + 2})`);
    const tickVals = legendScale.ticks(5);
    ticks.selectAll('text').data(tickVals).enter().append('text')
        .attr('x', d => legendScale(d))
        .attr('y', 10)
        .attr('text-anchor','middle')
        .text(d => Math.round(d*1000)/1000);

    container.appendChild(svg.node());

}