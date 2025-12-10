function visualizeCSV(rootEl, resp, transposed=false, basePayload=null){
    const txt = String(resp.csv || '').trim();
    if(!txt){ rootEl.textContent = 'Empty CSV'; return; }
    if(txt.startsWith('Error')){ rootEl.textContent = txt; return; }

    const rows2 = d3.csvParseRows(txt);
    if(!rows2 || rows2.length < 2 || rows2[0].length < 2){ rootEl.textContent = 'Unexpected CSV format'; return; }

    const nRows = rows2.length - 1;
    const nCols = rows2[0].length - 1;

    // Parse numeric matrix and compute domain
    const matrix = [];
    const vals = [];
    for(let r=1; r<rows2.length; r++){
        const row = [];
        for(let c=1; c<rows2[r].length; c++){
            const v = parseFloat(rows2[r][c]);
            row.push(v);
            if(!isNaN(v)) vals.push(v);
        }
        matrix.push(row);
    }
    const vmin = vals.length ? Math.min(...vals) : 0;
    const vmax = vals.length ? Math.max(...vals) : 1;

    // Extract labels
    const colLabels = rows2[0].slice(1);
    const rowLabels = rows2.slice(1).map(r => r[0]);

    const displayRows = transposed ? nCols : nRows;
    const displayCols = transposed ? nRows : nCols;
    const displayRowLabels = transposed ? colLabels : rowLabels;

    // Compute cell dimensions
    const containerW = rootEl.clientWidth;
    const containerH = rootEl.clientHeight;
    const cell_x = containerW / displayCols;
    const cell_y = containerH / displayRows;

    const svgW = displayCols * cell_x;
    const svgH = displayRows * cell_y;

    const svg = d3.create('svg')
        .attr('class', 'heatmap-svg')
        .attr('width', svgW)
        .attr('height', svgH)
        .attr('viewBox', `0 0 ${svgW} ${svgH}`)
        .attr('preserveAspectRatio', 'none')
        .attr('shape-rendering', 'crispEdges');

    // Color scale
    const color = d3.scaleSequentialSqrt(d3.interpolateViridis).domain([vmin, vmax]);

    // Render row labels in separate container
    const labelsContainer = document.getElementById('labels-section');
    let labelsSvg, labelGroups;
    if(labelsContainer){
        labelsContainer.innerHTML = '';
        const labelContainerH = labelsContainer.clientHeight;
        const labelCellH = labelContainerH / displayRows;
        
        labelsSvg = d3.create('svg')
            .attr('class', 'labels-svg')
            .attr('width', '100%')
            .attr('height', labelContainerH);
        
        labelGroups = labelsSvg.selectAll('g.label-row')
            .data(displayRowLabels)
            .enter()
            .append('g')
            .attr('class', 'label-row')
            .attr('transform', (_,i) => `translate(0, ${i * labelCellH})`);
        
        // Border rect (transparent, just for outline)
        labelGroups.append('rect')
            .attr('class', 'label-border')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', '100%')
            .attr('height', labelCellH);
        
        // Background group for 1D heatmap (time-averaged place data) - added after border
        labelGroups.append('g')
            .attr('class', 'place-heatmap-bg');
        
        // Text on top - font size relative to cell height
        const fontSize = Math.max(8, Math.min(labelCellH * 0.5, 20));
        labelGroups.append('text')
            .attr('x', '95%')
            .attr('y', 4)
            .attr('text-anchor', 'end')
            .attr('dominant-baseline', 'hanging')
            .style('font-size', `${fontSize}px`)
            .text(d => d);
        
        labelsContainer.appendChild(labelsSvg.node());
    }

    // Build and render heatmap cells
    const cellsG = svg.append('g');
    const displayMatrix = [];
    for(let r=0; r<displayRows; r++){
        const row = [];
        for(let c=0; c<displayCols; c++){
            const v = transposed ? matrix[c][r] : matrix[r][c];
            row.push(v);
        }
        displayMatrix.push(row);
    }

    const rowsSel = cellsG.selectAll('g.row')
        .data(displayMatrix)
        .enter()
        .append('g')
        .attr('class','row')
        .attr('transform', (_,i) => `translate(0, ${i*cell_y})`);
    
    rowsSel.selectAll('rect')
        .data(d => d)
        .enter()
        .append('rect')
        .attr('x', (_,i) => i * cell_x)
        .attr('y', 0)
        .attr('width', cell_x)
        .attr('height', cell_y)
        .attr('fill', d => (!isNaN(d) ? color(d) : '#707070ff'))
        .attr('stroke', 'none');

    // Row hover expansion behavior
    const expandFactor = displayRows / 4;
    const smallFactor = (displayRows - expandFactor) / (displayRows - 1);
    let activeExpanded = null;
    const rowGroups = cellsG.selectAll('g.row');

    function clearExpanded(){
        rowGroups.selectAll('rect')
            .transition().duration(150)
            .attr('height', cell_y)
            .attr('display', null);
        rowGroups.transition().duration(150)
            .attr('transform', (_,i) => `translate(0, ${i*cell_y})`);
        svg.transition().duration(150).attr('height', svgH);
        rowGroups.selectAll('g.mini').remove();
        
        // Reset label boxes
        if(labelGroups && labelsSvg){
            const labelContainerH = labelsContainer.clientHeight;
            const labelCellH = labelContainerH / displayRows;
            labelGroups.transition().duration(150)
                .attr('transform', (_,i) => `translate(0, ${i * labelCellH})`);
            labelGroups.select('rect').transition().duration(150)
                .attr('height', labelCellH);
            labelsSvg.transition().duration(150).attr('height', labelContainerH);
            // Clear 1D heatmap backgrounds
            labelGroups.selectAll('g.place-heatmap-bg').selectAll('*').remove();
        }
        
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

        // Apply new positions and heights
        rowGroups.each(function(_,idx){
            d3.select(this)
                .transition().duration(150)
                .attr('transform', `translate(0, ${yPos[idx]})`);
            d3.select(this).selectAll('rect')
                .transition().duration(150)
                .attr('height', heights[idx]);
        });

        svg.transition().duration(150).attr('height', cur);
        rowGroups.selectAll('rect').attr('display', null);
        rowGroups.selectAll('g.mini').remove();
        
        // Sync label boxes with row expansion
        if(labelGroups && labelsSvg){
            const labelContainerH = labelsContainer.clientHeight;
            const scaleFactor = labelContainerH / svgH;
            const labelHeights = heights.map(h => h * scaleFactor);
            const labelYPos = yPos.map(y => y * scaleFactor);
            
            labelGroups.each(function(_,idx){
                d3.select(this)
                    .transition().duration(150)
                    .attr('transform', `translate(0, ${labelYPos[idx]})`);
                d3.select(this).select('rect')
                    .transition().duration(150)
                    .attr('height', labelHeights[idx]);
            });
            
            const newLabelH = labelYPos[labelYPos.length - 1] + labelHeights[labelHeights.length - 1];
            labelsSvg.transition().duration(150).attr('height', newLabelH);
        }

        // Fetch detail CSV for expanded row
        if(basePayload){
            const topicVal = displayRowLabels[i];
            const payload = JSON.parse(JSON.stringify(basePayload));
            // ensure sample average is false for detail
            if(payload.specs && payload.specs.sample) payload.specs.sample.average = "false";
            // set topic to single
            payload.topic = { type: 'single', value: topicVal };
            // if original structure has specs.topic, mirror it
            if(payload.specs) payload.specs.topic = { type: 'single', value: topicVal };
            
            // Fetch time-averaged place data for 1D heatmap background
            const avgPayload = JSON.parse(JSON.stringify(basePayload));
            avgPayload.topic = { type: 'single', value: topicVal };
            if(avgPayload.specs){
                avgPayload.specs.topic = { type: 'single', value: topicVal };
                if(avgPayload.specs.sample) avgPayload.specs.sample.average = "time";
            }
            
            const avgQ = encodeURIComponent(JSON.stringify(avgPayload));
            fetch(`/data?attribute=${avgQ}`).then(async res=>{
                const ct = res.headers.get('content-type') || '';
                let txt;
                if(ct.includes('application/json')){
                    const j = await res.json();
                    txt = j.csv || '';
                } else {
                    txt = await res.text();
                }
                if(!txt || activeExpanded !== i) return;
                
                const avgRows = d3.csvParseRows(String(txt).trim());
                if(!avgRows || avgRows.length < 2) return;
                
                // Parse averaged values - each row is a place, with one value column
                const avgVals = [];
                for(let r=1; r<avgRows.length; r++){
                    // Try all columns after the first (label) column
                    for(let c=1; c<avgRows[r].length; c++){
                        const v = parseFloat(avgRows[r][c]);
                        if(!isNaN(v)){
                            avgVals.push(v);
                            break; // Only take first valid value per row
                        }
                    }
                }
                
                if(avgVals.length === 0 || activeExpanded !== i) return;
                
                const avgMin = Math.min(...avgVals);
                const avgMax = Math.max(...avgVals);
                const avgColor = d3.scaleSequential(d3.interpolateViridis).domain([avgMin, avgMax]);
                
                // Render 1D heatmap in the label background
                if(labelGroups && activeExpanded === i){
                    const labelGroup = d3.select(labelGroups.nodes()[i]);
                    const bgGroup = labelGroup.select('g.place-heatmap-bg');
                    bgGroup.selectAll('*').remove();
                    
                    const labelContainerH = labelsContainer.clientHeight;
                    const scaleFactor = labelContainerH / svgH;
                    const expandedLabelH = expandedH * scaleFactor;
                    const cellH = expandedLabelH / avgVals.length;
                    
                    avgVals.forEach((val, idx) => {
                        bgGroup.append('rect')
                            .attr('x', 0)
                            .attr('y', idx * cellH)
                            .attr('width', '100%')
                            .attr('height', cellH)
                            .attr('fill', avgColor(val))
                            .attr('opacity', 0.3)
                            .attr('stroke', 'none');
                    });
                    
                    // Move background group to back so it's behind border and text
                    labelGroup.node().insertBefore(bgGroup.node(), labelGroup.node().firstChild);
                }
            }).catch(() => {});

            const q = encodeURIComponent(JSON.stringify(payload));
            fetch(`/data?attribute=${q}`).then(async res=>{
                const ct = res.headers.get('content-type') || '';
                let txt;
                if(ct.includes('application/json')){
                    const j = await res.json();
                    txt = j.csv || '';
                } else {
                    txt = await res.text();
                }
                if(!txt || activeExpanded !== i) return;
                
                const miniRows = d3.csvParseRows(String(txt).trim());
                if(!miniRows || miniRows.length < 2) return;

                const mCols = miniRows[0].length - 1;
                const mRows = miniRows.length - 1;
                if(mCols <= 0 || mRows <= 0) return;

                const miniVals = [];
                const miniMat = [];
                for(let r=1; r<miniRows.length; r++){
                    const row = [];
                    for(let c=1; c<miniRows[r].length; c++){
                        const v = parseFloat(miniRows[r][c]);
                        row.push(v);
                        if(!isNaN(v)) miniVals.push(v);
                    }
                    miniMat.push(row);
                }
                const mvmin = miniVals.length ? Math.min(...miniVals) : 0;
                const mvmax = miniVals.length ? Math.max(...miniVals) : 1;
                const mcolor = d3.scaleSequential(d3.interpolateInferno).domain([mvmin, mvmax]);

                if(activeExpanded !== i) return;
                const hoveredGroup = d3.select(rowGroups.nodes()[i]);
                hoveredGroup.selectAll('g.mini').remove();
                hoveredGroup.selectAll('rect').attr('display', 'none');
                const miniG = hoveredGroup.append('g').attr('class','mini');

                const innerTransposed = !!transposed;
                const renderCols = innerTransposed ? mRows : mCols;
                const renderRows = innerTransposed ? mCols : mRows;

                const mCellW = Math.max(6, (displayCols * cell_x) / renderCols);
                const mCellH = Math.max(6, (expandedH) / renderRows);

                for(let rr=0; rr<renderRows; rr++){
                    for(let cc=0; cc<renderCols; cc++){
                        const val = innerTransposed ? miniMat[cc][rr] : miniMat[rr][cc];
                        miniG.append('rect')
                            .attr('x', cc * mCellW)
                            .attr('y', rr * mCellH)
                            .attr('width', mCellW)
                            .attr('height', mCellH)
                            .attr('fill', !isNaN(val) ? mcolor(val) : '#707070ff');
                    }
                }
            }).catch(() => {});
        }
    });

    rowGroups.on('mouseleave', function(){
        const i = rowGroups.nodes().indexOf(this);
        if(i >= 0 && activeExpanded === i) clearExpanded();
    });

    cellsG.on('mouseleave', clearExpanded);

    rootEl.appendChild(svg.node());

    // Render legend
    const legendContainer = document.getElementById('legend-section');
    if(legendContainer){
        legendContainer.innerHTML = '';
        const legendSvg = d3.create('svg')
            .attr('class', 'legend-svg')
            .attr('width', '100%')
            .attr('height', '100%');
        
        const gid = 'legend-grad-' + Date.now();
        const grad = legendSvg.append('defs')
            .append('linearGradient')
            .attr('id', gid)
            .attr('x1', '0%')
            .attr('x2', '100%');
        
        const stops = 8;
        for(let i=0; i<=stops; i++){
            grad.append('stop')
                .attr('offset', `${(i/stops)*100}%`)
                .attr('stop-color', color(vmin + (i/stops)*(vmax - vmin)));
        }

        legendSvg.append('rect')
            .attr('x', '5%')
            .attr('y', '30%')
            .attr('width', '90%')
            .attr('height', '40%')
            .attr('fill', `url(#${gid})`);

        [vmin, (vmin+vmax)/2, vmax].forEach((val, i) => {
            legendSvg.append('text')
                .attr('x', `${5 + i*45}%`)
                .attr('y', '85%')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .text(Math.round(val*1000)/1000);
        });
        
        legendContainer.appendChild(legendSvg.node());
    }
}