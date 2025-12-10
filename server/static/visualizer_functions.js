function visualizeCSV(rootEl, resp, transposed=false, basePayload=null){
    const txt = String(resp.csv || '').trim();
    if(!txt){ rootEl.textContent = 'Empty CSV'; return; }
    if(txt.startsWith('Error')){ rootEl.textContent = txt; return; }

    const rows2 = d3.csvParseRows(txt);
    if(!rows2 || rows2.length < 2 || rows2[0].length < 2){ rootEl.textContent = 'Unexpected CSV format'; return; }

    const nRows = rows2.length - 1;
    const nCols = rows2[0].length - 1;
    
    // Variables for cell hover tracking
    let hoveredCell = null;
    let cellHighlight = null;
    let tooltip = null;
    
    // Store mini-heatmap labels for tooltip access
    let storedRowLabels = [];

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
    const displayColLabels = transposed ? rowLabels : colLabels;

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
        .attr('stroke', 'none')
        .datum((d, i) => ({col: i, value: d}));

    // Row hover expansion behavior
    const expandFactor = displayRows / 4;
    const smallFactor = (displayRows - expandFactor) / (displayRows - 1);
    let activeExpanded = null;
    const rowGroups = cellsG.selectAll('g.row');
    let collapseTimeout = null;

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
            labelGroups.select('.label-border').transition().duration(150)
                .attr('height', labelCellH);
            labelsSvg.transition().duration(150).attr('height', labelContainerH);
            // Clear 1D heatmap backgrounds and place labels
            labelGroups.selectAll('g.place-heatmap-bg').selectAll('*').remove();
            labelGroups.selectAll('g.place-labels').remove();
            // Reset main label to right-aligned position
            labelGroups.select('text')
                .attr('x', '95%')
                .attr('text-anchor', 'end');
        }
        
        activeExpanded = null;
        expandedRowBounds = null;
        clearCellHighlight();
    }
    
    function clearCellHighlight(){
        if(cellHighlight){
            cellHighlight.remove();
            cellHighlight = null;
        }
        if(tooltip){
            tooltip.remove();
            tooltip = null;
        }
        hoveredCell = null;
    }
    
    function createHighlightBorder(parent, x, y, width, height){
        return parent.append('rect')
            .attr('class', 'cell-highlight')
            .attr('x', x)
            .attr('y', y)
            .attr('width', width)
            .attr('height', height)
            .attr('fill', 'none')
            .attr('stroke', 'white')
            .attr('stroke-width', 2)
            .attr('pointer-events', 'none');
    }
    
    function showTooltipForCell(event, rowLabel, colLabel, value){
        if(tooltip) tooltip.remove();
        
        const valueStr = !isNaN(value) ? value.toFixed(3) : 'N/A';
        let content = '';
        if(rowLabel) content += `<strong>Site:</strong> ${rowLabel}<br>`;
        content += `<strong>Date:</strong> ${colLabel}<br><strong>Value:</strong> ${valueStr}`;
        
        // Determine tooltip position - switch to left side if near right edge
        const tooltipOffset = 15;
        const screenWidth = window.innerWidth;
        const nearRightEdge = event.clientX > screenWidth * 0.7;
        
        tooltip = d3.select('body').append('div')
            .attr('class', 'heatmap-tooltip')
            .style('position', 'fixed')
            .style('background', 'rgba(0, 0, 0, 0.9)')
            .style('color', 'white')
            .style('padding', '10px')
            .style('border-radius', '4px')
            .style('font-size', '13px')
            .style('pointer-events', 'none')
            .style('z-index', '99999')
            .style('border', '1px solid white')
            .style('white-space', 'nowrap')
            .html(content);
        
        // Position tooltip after creation so we can measure its width
        const tooltipWidth = tooltip.node().offsetWidth;
        const leftPos = nearRightEdge 
            ? (event.clientX - tooltipWidth - tooltipOffset) + 'px'
            : (event.clientX + tooltipOffset) + 'px';
        
        tooltip.style('left', leftPos)
            .style('top', (event.clientY + tooltipOffset) + 'px');
    }
    
    function highlightCollapsedCell(rowGroup, colIdx, rowIdx, event){
        const cellKey = `collapsed-${colIdx}`;
        if(hoveredCell === cellKey && cellHighlight) return;
        
        hoveredCell = cellKey;
        if(cellHighlight) cellHighlight.remove();
        
        const rects = d3.select(rowGroup).selectAll('rect');
        const rect = d3.select(rects.nodes()[colIdx]);
        const x = parseFloat(rect.attr('x'));
        const y = parseFloat(rect.attr('y'));
        const width = parseFloat(rect.attr('width'));
        const height = parseFloat(rect.attr('height'));
        
        cellHighlight = createHighlightBorder(d3.select(rowGroup), x, y, width, height);
        
        const cellData = rect.datum();
        const rowLabel = displayRowLabels[rowIdx] || 'Unknown';
        const colLabel = displayColLabels[colIdx] || 'Unknown';
        showTooltipForCell(event, rowLabel, colLabel, cellData ? cellData.value : null);
    }
    
    function highlightCell(rectNode, colIdx, rowIdx, event){
        const rect = d3.select(rectNode);
        const x = parseFloat(rect.attr('x'));
        const y = parseFloat(rect.attr('y'));
        const width = parseFloat(rect.attr('width'));
        const height = parseFloat(rect.attr('height'));
        
        const cellKey = `${colIdx},${rowIdx}`;
        if(hoveredCell === cellKey && cellHighlight) return;
        
        hoveredCell = cellKey;
        if(cellHighlight) cellHighlight.remove();
        
        const expandedGroup = d3.select(rowGroups.nodes()[activeExpanded]);
        cellHighlight = createHighlightBorder(expandedGroup, x, y, width, height);
        
        const cellData = rect.datum();
        const rowLabel = storedRowLabels[cellData.row] || 'Unknown';
        const colLabel = displayColLabels[cellData.col] || 'Unknown';
        showTooltipForCell(event, rowLabel, colLabel, cellData.value);
    }

    // Simple mouse tracking approach - check which row the cursor is over
    function getRowIndexFromY(containerElement, mouseY, rowCount){
        const containerRect = containerElement.getBoundingClientRect();
        const relativeY = mouseY - containerRect.top;
        const containerHeight = containerRect.height;
        
        if(relativeY < 0 || relativeY > containerHeight) return -1;
        
        // Simple calculation assuming equal distribution
        const rowIndex = Math.floor((relativeY / containerHeight) * rowCount);
        return Math.max(0, Math.min(rowIndex, rowCount - 1));
    }
    
    function checkAndUpdateExpansion(event){
        // Cancel any pending collapse
        if(collapseTimeout){
            clearTimeout(collapseTimeout);
            collapseTimeout = null;
        }
        
        let targetRow = -1;
        
        // Check if mouse is over label container - this triggers expansion
        if(labelsContainer){
            const labelRect = labelsContainer.getBoundingClientRect();
            if(event.clientX >= labelRect.left && event.clientX <= labelRect.right &&
               event.clientY >= labelRect.top && event.clientY <= labelRect.bottom){
                targetRow = getRowIndexFromY(labelsContainer, event.clientY, displayRows);
            }
        }
        
        // If not over labels but something is expanded, check if we're still in the expanded row's heatmap area
        if(targetRow === -1 && activeExpanded !== null && expandedRowBounds){
            const heatmapRect = svg.node().getBoundingClientRect();
            if(event.clientX >= heatmapRect.left && event.clientX <= heatmapRect.right &&
               event.clientY >= heatmapRect.top && event.clientY <= heatmapRect.bottom){
                // Use actual expanded bounds instead of calculating from equal distribution
                const mouseY = event.clientY - heatmapRect.top;
                if(mouseY >= expandedRowBounds.heatmapTop && mouseY <= expandedRowBounds.heatmapBottom){
                    targetRow = activeExpanded;
                    
                    const mouseX = event.clientX - heatmapRect.left;
                    const expandedGroup = d3.select(rowGroups.nodes()[activeExpanded]);
                    const miniG = expandedGroup.select('g.mini');
                    if(!miniG.empty()){
                        const miniRects = miniG.selectAll('rect');
                        if(!miniRects.empty()){
                            const firstRect = d3.select(miniRects.nodes()[0]);
                            const rectWidth = parseFloat(firstRect.attr('width'));
                            const rectHeight = parseFloat(firstRect.attr('height'));
                            
                            const rowLocalY = mouseY - expandedRowBounds.heatmapTop;
                            const miniCol = Math.floor(mouseX / rectWidth);
                            const miniRow = Math.floor(rowLocalY / rectHeight);
                            
                            let targetRect = null;
                            miniRects.each(function(){
                                const rectData = d3.select(this).datum();
                                if(rectData && rectData.row === miniRow && rectData.col === miniCol){
                                    targetRect = this;
                                }
                            });
                            
                            if(targetRect){
                                highlightCell(targetRect, miniCol, miniRow, event);
                            } else {
                                clearCellHighlight();
                            }
                        }
                    } else {
                        clearCellHighlight();
                    }
                } else {
                    clearCellHighlight();
                }
            } else {
                clearCellHighlight();
            }
        } else if(targetRow === -1){
            // Check if hovering over a collapsed row
            const heatmapRect = svg.node().getBoundingClientRect();
            if(event.clientX >= heatmapRect.left && event.clientX <= heatmapRect.right &&
               event.clientY >= heatmapRect.top && event.clientY <= heatmapRect.bottom){
                const mouseY = event.clientY - heatmapRect.top;
                const mouseX = event.clientX - heatmapRect.left;
                const collapsedRowIdx = Math.floor(mouseY / cell_y);
                
                if(collapsedRowIdx >= 0 && collapsedRowIdx < displayRows){
                    const colIdx = Math.floor(mouseX / cell_x);
                    if(colIdx >= 0 && colIdx < displayCols){
                        const rowGroup = rowGroups.nodes()[collapsedRowIdx];
                        highlightCollapsedCell(rowGroup, colIdx, collapsedRowIdx, event);
                    } else {
                        clearCellHighlight();
                    }
                } else {
                    clearCellHighlight();
                }
            } else {
                clearCellHighlight();
            }
        } else {
            clearCellHighlight();
        }
        
        // Update expansion if needed
        if(targetRow !== -1 && targetRow !== activeExpanded){
            expandRow(targetRow);
        } else if(targetRow === -1 && activeExpanded !== null){
            // Delay collapse slightly to handle gaps between containers
            collapseTimeout = setTimeout(() => {
                clearExpanded();
                collapseTimeout = null;
            }, 10);
        }
    }
    
    function expandRow(i){
        if(i < 0 || i >= displayRows) return;
        
        // Clear previous expansion if switching to a different row
        if(activeExpanded !== null && activeExpanded !== i){
            // Clean up the previously expanded row's labels
            const prevLabelGroup = d3.select(labelGroups.nodes()[activeExpanded]);
            prevLabelGroup.selectAll('g.place-heatmap-bg').selectAll('*').remove();
            prevLabelGroup.selectAll('g.place-labels').remove();
            // Reset previous row's main label to right-aligned
            prevLabelGroup.select('text')
                .attr('x', '95%')
                .attr('text-anchor', 'end');
            
            rowGroups.selectAll('g.mini').remove();
        }
        
        activeExpanded = i;

        const expandedH = cell_y * expandFactor;
        const smallH = Math.max(1, cell_y * smallFactor);

        // compute new y positions
        const heights = [];
        for(let r=0;r<displayRows;r++) heights.push(r===i ? expandedH : smallH);
        const yPos = [];
        let cur = 0;
        for(let r=0;r<displayRows;r++){ yPos.push(cur); cur += heights[r]; }

        // Store the expanded row bounds for accurate mouse tracking
        expandedRowBounds = {
            heatmapTop: yPos[i],
            heatmapBottom: yPos[i] + heights[i],
            labelTop: 0,
            labelBottom: 0
        };

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
            
            // Store label bounds for mouse tracking
            expandedRowBounds.labelTop = labelYPos[i];
            expandedRowBounds.labelBottom = labelYPos[i] + labelHeights[i];
            
            labelGroups.each(function(_,idx){
                d3.select(this)
                    .transition().duration(150)
                    .attr('transform', `translate(0, ${labelYPos[idx]})`);
                d3.select(this).select('.label-border')
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
                
                // Parse averaged values and place labels
                const avgVals = [];
                const placeLabels = [];
                for(let r=1; r<avgRows.length; r++){
                    // First column is the place label
                    placeLabels.push(avgRows[r][0] || '');
                    // Try all columns after the first (label) column for values
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
                    
                    // Move main label to left 65% and add place labels on right 35%
                    const mainText = labelGroup.select('text');
                    const labelWidth = labelsContainer.clientWidth;
                    
                    // Adjust main label to use only 65% width, left-aligned
                    mainText
                        .attr('x', 5)
                        .attr('text-anchor', 'start')
                        .attr('width', labelWidth * 0.65);
                    
                    // Add place labels on the right 35%
                    const placeLabelsGroup = labelGroup.selectAll('g.place-labels').data([null]);
                    const placeLabelsEnter = placeLabelsGroup.enter().append('g').attr('class', 'place-labels');
                    const placeLabelsG = placeLabelsGroup.merge(placeLabelsEnter);
                    placeLabelsG.selectAll('*').remove();
                    
                    const placeFontSize = Math.max(8, Math.min(cellH * 0.9, 16));
                    
                    placeLabels.forEach((label, idx) => {
                        placeLabelsG.append('text')
                            .attr('x', '98%')
                            .attr('y', idx * cellH + cellH / 2)
                            .attr('dy', '0.35em')
                            .attr('text-anchor', 'end')
                            .style('font-size', `${placeFontSize}px`)
                            .style('fill', 'var(--text)')
                            .style('pointer-events', 'none')
                            .text(label);
                    });
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

                // Store mini-heatmap metadata for tooltip
                const miniPlaceLabels = [];
                for(let r=1; r<miniRows[0].length; r++){
                    miniPlaceLabels.push(miniRows[0][r]);
                }
                
                // Store only place labels for tooltip access (dates come from main heatmap)
                storedRowLabels = miniPlaceLabels;

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
                            .attr('fill', !isNaN(val) ? mcolor(val) : '#707070ff')
                            .datum({row: rr, col: cc, value: val});
                    }
                }
            }).catch(() => {});
        }
    }

    rootEl.appendChild(svg.node());

    // Set up continuous mouse tracking for expansion
    const heatmapContainer = svg.node().parentElement;
    
    if(heatmapContainer){
        heatmapContainer.addEventListener('mousemove', checkAndUpdateExpansion);
        heatmapContainer.addEventListener('mouseleave', () => {
            checkAndUpdateExpansion({clientX: -9999, clientY: -9999});
        });
    }
    
    if(labelsContainer){
        labelsContainer.addEventListener('mousemove', checkAndUpdateExpansion);
        labelsContainer.addEventListener('mouseleave', () => {
            checkAndUpdateExpansion({clientX: -9999, clientY: -9999});
        });
    }

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
    
    // Render timeline in timescale section
    const timeContainer = document.getElementById('timescale-section');
    // Use colLabels for time data (these represent time points across columns)
    const timeLabels = transposed ? rowLabels : colLabels;
    if(timeContainer && timeLabels && timeLabels.length > 0){
        timeContainer.innerHTML = '';
        
        // Parse dates from time labels
        const dates = timeLabels.map(label => {
            const d = new Date(label);
            return isNaN(d.getTime()) ? null : d;
        }).filter(d => d !== null);
        
        if(dates.length > 0){
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            
            const timeSvg = d3.create('svg')
                .attr('class', 'timeline-svg')
                .attr('width', '100%')
                .attr('height', '100%');
            
            // Create scale that maps to percentage positions
            const timeScale = d3.scaleTime()
                .domain([minDate, maxDate])
                .range([0, 100]);
            
            // Timeline axis - full width
            timeSvg.append('line')
                .attr('x1', '0%')
                .attr('x2', '100%')
                .attr('y1', '30%')
                .attr('y2', '30%')
                .attr('stroke', 'var(--text)')
                .attr('stroke-width', 2);
            
            // Find first occurrence of each month
            const monthTicks = [];
            const seenMonths = new Set();
            dates.forEach(date => {
                const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
                if(!seenMonths.has(monthKey)){
                    seenMonths.add(monthKey);
                    monthTicks.push(date);
                }
            });
            
            // Remove first tick if it's not at the start of the month
            if(monthTicks.length > 0){
                const firstDate = dates[0];
                if(firstDate.getDate() !== 1){
                    monthTicks.shift(); // Remove first element
                }
            }
            
            const formatter = d3.timeFormat('%b %Y');
            
            monthTicks.forEach(tick => {
                const xPos = timeScale(tick);
                
                // Tick mark
                timeSvg.append('line')
                    .attr('x1', `${xPos}%`)
                    .attr('x2', `${xPos}%`)
                    .attr('y1', '20%')
                    .attr('y2', '40%')
                    .attr('stroke', 'var(--text)')
                    .attr('stroke-width', 1);
                
                // Tick label
                timeSvg.append('text')
                    .attr('x', `${xPos}%`)
                    .attr('y', '50%')
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'hanging')
                    .style('font-size', '11px')
                    .style('fill', 'var(--text)')
                    .text(formatter(tick));
            });
            
            timeContainer.appendChild(timeSvg.node());
        }
    }
}