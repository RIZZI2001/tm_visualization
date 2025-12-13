function visualizeCSV(rootEl, resp, basePayload=null){
    const txt = String(resp.csv || '').trim();
    if(!txt){ rootEl.textContent = 'Empty CSV'; return; }
    if(txt.startsWith('Error')){ rootEl.textContent = txt; return; }

    const rows2 = d3.csvParseRows(txt);
    if(!rows2 || rows2.length < 2 || rows2[0].length < 2){ rootEl.textContent = 'Unexpected CSV format'; return; }

    // Reading dimensions (data is transposed)
    const nCols = rows2.length - 1;
    const nRows = rows2[0].length - 1;
    
    // Variables for cell hover tracking
    let hoveredCell = null;
    let cellHighlight = null;
    let tooltip = null;
    
    // Store mini-heatmap labels for tooltip access
    let storedRowLabels = [];

    // Parse numeric matrix and compute domain
    const matrix = [];
    let vmin = Infinity;
    let vmax = -Infinity;

    // Build matrix column-wise (necessary for svg rendering later)
    for(let c=1; c<=nRows; c++){
        const col = [];
        for(let r=1; r<=nCols; r++){
            const v = parseFloat(rows2[r][c]);
            col.push(v);
            if(!isNaN(v)) {
                if(v < vmin) vmin = v;
                if(v > vmax) vmax = v;
            }
        }
        matrix.push(col);
    }

    // Extract labels
    const rowLabels = rows2[0].slice(1);
    const colLabels = rows2.slice(1).map(r => r[0]);

    // Compute cell dimensions
    const cell_x = rootEl.clientWidth / nCols;
    const cell_y = rootEl.clientHeight / nRows;

    const svgW = nCols * cell_x;
    const svgH = nRows * cell_y;

    const svg = d3.create('svg')
        .attr('class', 'heatmap-svg')
        .attr('width', svgW)
        .attr('height', svgH)
        .attr('viewBox', `0 0 ${svgW} ${svgH}`)
        .attr('preserveAspectRatio', 'none')
        .attr('shape-rendering', 'crispEdges');

    // Color scale
    const color = d3.scaleSequentialSqrt(d3.interpolateInferno).domain([vmin, vmax]);

    // Render row labels in separate container
    const labelsContainer = document.getElementById('labels-section');
    let labelsSvg, labelGroups;
    labelsContainer.innerHTML = '';
    const labelCellH = labelsContainer.clientHeight / nRows;
    
    labelsSvg = d3.create('svg')
        .attr('class', 'labels-svg')
        .attr('width', '100%')
        .attr('height', labelsContainer.clientHeight);
    
    labelGroups = labelsSvg.selectAll('g.label-row')
        .data(rowLabels)
        .enter()
        .append('g')
        .attr('class', 'label-row')
        .attr('transform', (_,i) => `translate(0, ${i * labelCellH})`);
    
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

    // Build and render heatmap cells
    const cellsG = svg.append('g');
    const rowsSel = cellsG.selectAll('g.row')
        .data(matrix)
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
    const expandFactor = nRows / 4;
    const smallFactor = (nRows - expandFactor) / (nRows - 1);
    let activeExpanded = null;
    const rowGroups = cellsG.selectAll('g.row');
    let collapseTimeout = null;
    
    // Horizontal zoom state
    let zoomScale = 1;
    let panOffset = 0;

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
            const labelCellH = labelContainerH / nRows;
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
            .attr('fill', 'white')
            .attr('opacity', 0.3)
            .attr('pointer-events', 'none');
    }
    
    function showTooltipForCell(event, rowLabel, colLabel, value, isCollapsed = false, cellRect = null){
        if(tooltip) tooltip.remove();
        
        const valueStr = !isNaN(value) ? value.toFixed(3) : 'N/A';
        
        // Format date as day-month-year
        let formattedDate = colLabel;
        const parsedDate = new Date(colLabel);
        if(!isNaN(parsedDate.getTime())) {
            const day = String(parsedDate.getDate()).padStart(2, '0');
            const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const year = parsedDate.getFullYear();
            formattedDate = `${day}-${month}-${year}`;
        }
        
        let content = '';
        if(rowLabel){
            if(isCollapsed){
                content += `${rowLabel}<br>`;
            } else {
                content += `<strong>Site:</strong> ${rowLabel}<br>`;
            }
        }
        content += `<strong>Date:</strong> ${formattedDate}<br><strong>Value:</strong> ${valueStr}`;
        
        // Determine tooltip position - use cell boundaries if provided
        const tooltipOffset = 5;
        let posX = event.clientX;
        let posY = event.clientY;
        
        // If cell rect provided, use its boundaries for more accurate positioning
        if(cellRect) {
            posX = cellRect.right;
            posY = cellRect.top;
        }
        
        const nearRightEdge = posX > window.innerWidth * 0.9;
        
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
            ? (posX - tooltipWidth - tooltipOffset) + 'px'
            : (posX + tooltipOffset) + 'px';
        
        tooltip.style('left', leftPos)
            .style('top', (posY + tooltipOffset) + 'px');
    }
    
    function highlightCellCommon(rect, parent, colIdx, rowIdx, event, isCollapsed){
        const cellKey = isCollapsed ? `collapsed-${rowIdx}-${colIdx}` : `${colIdx},${rowIdx}`;
        if(hoveredCell === cellKey && cellHighlight) return;
        
        hoveredCell = cellKey;
        if(cellHighlight) cellHighlight.remove();
        
        const x = parseFloat(rect.attr('x'));
        const y = parseFloat(rect.attr('y'));
        const width = parseFloat(rect.attr('width'));
        const height = parseFloat(rect.attr('height'));
        
        cellHighlight = createHighlightBorder(parent, x, y, width, height);
        
        const cellData = rect.datum();
        const rowLabel = isCollapsed 
            ? (rowLabels[rowIdx] || 'Unknown')
            : (storedRowLabels[cellData.row] || 'Unknown');
        const colLabel = colLabels[isCollapsed ? colIdx : cellData.col] || 'Unknown';
        
        // Get actual screen boundaries of the rect for tooltip positioning
        const rectNode = rect.node();
        const cellRect = rectNode ? rectNode.getBoundingClientRect() : null;
        
        showTooltipForCell(event, rowLabel, colLabel, cellData ? cellData.value : null, isCollapsed, cellRect);
    }
    
    function highlightCollapsedCell(rowGroup, colIdx, rowIdx, event){
        const rects = d3.select(rowGroup).selectAll('rect');
        const rect = d3.select(rects.nodes()[colIdx]);
        highlightCellCommon(rect, d3.select(rowGroup), colIdx, rowIdx, event, true);
    }
    
    function highlightCell(rectNode, colIdx, rowIdx, event){
        const rect = d3.select(rectNode);
        const expandedGroup = d3.select(rowGroups.nodes()[activeExpanded]);
        highlightCellCommon(rect, expandedGroup, colIdx, rowIdx, event, false);
    }

    // Simple mouse tracking approach - check which row the mouse is over (in the original unexpanded layout)
    function getRowIndexFromY(containerElement, mouseY, rowCount){
        const containerRect = containerElement.getBoundingClientRect();
        const relativeY = mouseY - containerRect.top;
        const containerHeight = containerRect.height;
        
        if(relativeY < 0 || relativeY > containerHeight) return -1;

        const rowIndex = Math.floor((relativeY / containerHeight) * rowCount);
        return Math.max(0, Math.min(rowIndex, rowCount - 1));
    }
    
    function checkAndUpdateExpansion(event) {
        if (collapseTimeout) {
            clearTimeout(collapseTimeout);
            collapseTimeout = null;
        }
        
        let targetRow = -1;
        
        // Check if mouse is over label container
        if (labelsContainer) {
            const labelRect = labelsContainer.getBoundingClientRect();
            if (event.clientX >= labelRect.left && event.clientX <= labelRect.right &&
                event.clientY >= labelRect.top && event.clientY <= labelRect.bottom) {
                targetRow = getRowIndexFromY(labelsContainer, event.clientY, nRows);
            }
        }
        
        // Handle cell hover in heatmap
        const heatmapRect = svg.node().getBoundingClientRect();
        if (event.clientX >= heatmapRect.left && event.clientX <= heatmapRect.right &&
            event.clientY >= heatmapRect.top && event.clientY <= heatmapRect.bottom) {
            
            const mouseY = event.clientY - heatmapRect.top;
            const mouseX = event.clientX - heatmapRect.left;
            
            // Expanded row cell hover
            if (targetRow === -1 && activeExpanded !== null && expandedRowBounds &&
                mouseY >= expandedRowBounds.heatmapTop && mouseY <= expandedRowBounds.heatmapBottom) {
                
                targetRow = activeExpanded;
                const expandedGroup = d3.select(rowGroups.nodes()[activeExpanded]);
                const miniRects = expandedGroup.select('g.mini').selectAll('rect');
                
                if (!miniRects.empty()) {
                    // Find number of columns in mini heatmap
                    let maxCol = 0;
                    miniRects.each(function() {
                        const d = d3.select(this).datum();
                        if (d && d.col > maxCol) maxCol = d.col;
                    });
                    
                    // Recalculate mini cell dimensions based on current heatmap width
                    const currentHeatmapWidth = heatmapRect.width;
                    const rectWidth = currentHeatmapWidth / (maxCol + 1);
                    
                    const firstRect = d3.select(miniRects.nodes()[0]);
                    const rectHeight = parseFloat(firstRect.attr('height'));
                    // Account for zoom and pan transform (same as main heatmap)
                    const transformedMouseX = (mouseX + panOffset) / zoomScale;
                    const miniCol = Math.floor(transformedMouseX / rectWidth);
                    const miniRow = Math.floor((mouseY - expandedRowBounds.heatmapTop) / rectHeight);
                    
                    let targetRect = null;
                    miniRects.each(function() {
                        const d = d3.select(this).datum();
                        if (d && d.row === miniRow && d.col === miniCol) targetRect = this;
                    });
                    
                    targetRect ? highlightCell(targetRect, miniCol, miniRow, event) : clearCellHighlight();
                } else {
                    clearCellHighlight();
                }
            }
            // Collapsed row cell hover
            else if (targetRow === -1) {
                // Recalculate cell dimensions based on current container size
                const currentCellX = heatmapRect.width / nCols;
                const currentCellY = heatmapRect.height / nRows;
                
                const rowIdx = Math.floor(mouseY / currentCellY);
                // Account for zoom and pan transform
                const transformedMouseX = (mouseX + panOffset) / zoomScale;
                const colIdx = Math.floor(transformedMouseX / currentCellX);
                
                if (rowIdx >= 0 && rowIdx < nRows && colIdx >= 0 && colIdx < nCols) {
                    highlightCollapsedCell(rowGroups.nodes()[rowIdx], colIdx, rowIdx, event);
                } else {
                    clearCellHighlight();
                }
            }
        } else {
            clearCellHighlight();
        }
        
        // Update expansion state
        if (targetRow !== -1 && targetRow !== activeExpanded) {
            expandRow(targetRow);
        } else if (targetRow === -1 && activeExpanded !== null) {
            collapseTimeout = setTimeout(() => {
                clearExpanded();
                collapseTimeout = null;
            }, 10);
        }
    }
    
    function expandRow(i){
        if(i < 0 || i >= nRows) return;
        
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
        for(let r=0;r<nRows;r++) heights.push(r===i ? expandedH : smallH);
        const yPos = [];
        let cur = 0;
        for(let r=0;r<nRows;r++){ yPos.push(cur); cur += heights[r]; }

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
        const topicVal = rowLabels[i];
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
                const avgColor = d3.scaleSequential(d3.interpolateInferno).domain([avgMin, avgMax]);
                
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

                const renderCols = mRows;
                const renderRows = mCols;

                // Store mini-heatmap metadata for tooltip
                const miniPlaceLabels = [];
                for(let r=1; r<miniRows[0].length; r++){
                    miniPlaceLabels.push(miniRows[0][r]);
                }
                
                // Store only place labels for tooltip access (dates come from main heatmap)
                storedRowLabels = miniPlaceLabels;

                const mCellW = Math.max(6, (nCols * cell_x) / renderCols);
                const mCellH = Math.max(6, (expandedH) / renderRows);

                for(let rr=0; rr<renderRows; rr++){
                    for(let cc=0; cc<renderCols; cc++){
                        const val = miniMat[cc][rr];
                        miniG.append('rect')
                            .attr('x', cc * mCellW)
                            .attr('y', rr * mCellH)
                            .attr('width', mCellW)
                            .attr('height', mCellH)
                            .attr('fill', !isNaN(val) ? mcolor(val) : '#707070ff')
                            .datum({row: rr, col: cc, value: val});
                    }
                }
                
                // Add border around mini heatmap
                miniG.append('rect')
                    .attr('x', 0.5)
                    .attr('y', 0.5)
                    .attr('width', renderCols * mCellW - 1)
                    .attr('height', renderRows * mCellH - 1)
                    .attr('fill', 'none')
                    .attr('stroke', 'white')
                    .attr('stroke-width', 1)
                    .attr('pointer-events', 'none');
            }).catch(() => {});
        }
    }

    rootEl.appendChild(svg.node());

    // Set up continuous mouse tracking for expansion
    const heatmapContainer = svg.node().parentElement;
    
    // Horizontal zoom with mousewheel
    function handleZoom(event) {
        event.preventDefault();
        
        const heatmapRect = svg.node().getBoundingClientRect();
        const mouseX = event.clientX - heatmapRect.left;
        
        // Calculate zoom factor
        const zoomDelta = event.deltaY > 0 ? 0.9 : 1.1;
        const newZoomScale = Math.max(1, Math.min(10, zoomScale * zoomDelta));
        
        if (newZoomScale === zoomScale) return;
        
        // Calculate focal point in unzoomed coordinates
        const focalPointX = (mouseX + panOffset) / zoomScale;
        
        // Calculate new pan offset to keep focal point under cursor
        panOffset = focalPointX * newZoomScale - mouseX;
        
        // Clamp pan offset
        const maxPan = svgW * newZoomScale - svgW;
        panOffset = Math.max(0, Math.min(maxPan, panOffset));
        
        zoomScale = newZoomScale;
        
        // Apply transform to cellsG (mini-heatmaps inherit this automatically)
        const transform = `translate(${-panOffset}, 0) scale(${zoomScale}, 1)`;
        cellsG.attr('transform', transform);
        
        // Update timeline with new zoom
        updateTimeline();
        
        // Update line graphs with new zoom
        const lineGraphSection = document.getElementById('linegraph-section');
        if(lineGraphSection){
            updateLineGraphs(lineGraphSection, zoomScale, panOffset, svgW);
        }
    }
    
    if(heatmapContainer){
        heatmapContainer.addEventListener('mousemove', checkAndUpdateExpansion);
        heatmapContainer.addEventListener('mouseleave', () => {
            checkAndUpdateExpansion({clientX: -9999, clientY: -9999});
        });
        heatmapContainer.addEventListener('wheel', handleZoom, {passive: false});
        
        // Watch for container resize to update timeline and line graphs
        const resizeObserver = new ResizeObserver(() => {
            const newWidth = heatmapContainer.clientWidth;
            const scaleRatio = newWidth / svgW;
            
            // Update timeline with new width
            if(timelineScale && timelineG && timelineAxis) {
                timelineScale.range([0, newWidth * zoomScale]);
                timelineG.call(timelineAxis);
                timelineG.selectAll('text')
                    .style('font-size', '11px')
                    .style('fill', 'var(--text)');
                timelineG.selectAll('line, path')
                    .style('stroke', 'var(--text)');
            }
            
            // Update line graphs with new width
            const lineGraphSection = document.getElementById('linegraph-section');
            if(lineGraphSection && lineGraphSection._lineGraphData){
                lineGraphSection._lineGraphData.svgW = newWidth;
                updateLineGraphs(lineGraphSection, zoomScale, panOffset, newWidth);
            }
        });
        
        resizeObserver.observe(heatmapContainer);
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
    let timelineG = null;  // Store reference for zoom updates
    let timelineAxis = null;
    let timelineScale = null;
    let timelineDates = null;
    
    // Use colLabels for time data (these represent time points across columns)
    if(timeContainer && colLabels && colLabels.length > 0){
        timeContainer.innerHTML = '';
        
        // Parse dates from time labels
        const dates = colLabels.map(label => {
            const d = new Date(label);
            return isNaN(d.getTime()) ? null : d;
        }).filter(d => d !== null);
        
        if(dates.length > 0){
            timelineDates = dates;
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            
            const timeSvg = d3.create('svg')
                .attr('class', 'timeline-svg')
                .attr('width', '100%')
                .attr('height', '100%');
            
            // Create a group for timeline axis
            timelineG = timeSvg.append('g')
                .attr('class', 'timeline-content')
                .attr('transform', 'translate(0, 0)');
            
            // Create scale that maps to absolute pixel positions (matching heatmap width)
            timelineScale = d3.scaleTime()
                .domain([minDate, maxDate])
                .range([0, svgW]);
            
            // Create axis generator
            timelineAxis = d3.axisBottom(timelineScale)
                .tickFormat(d3.timeFormat('%d-%m-%Y'))
                .ticks(d3.timeMonth.every(1));
            
            // Render initial axis
            timelineG.call(timelineAxis);
            
            // Style the axis
            timelineG.selectAll('text')
                .style('font-size', '11px')
                .style('fill', 'var(--text)');
            
            timelineG.selectAll('line, path')
                .style('stroke', 'var(--text)');
            
            timeContainer.appendChild(timeSvg.node());
        }
    }
    
    // Function to update timeline based on zoom
    function updateTimeline() {
        if(!timelineG || !timelineScale || !timelineDates) return;
        
        const minDate = new Date(Math.min(...timelineDates));
        const maxDate = new Date(Math.max(...timelineDates));
        
        // Update scale range based on zoom
        timelineScale.range([0, svgW * zoomScale]);
        
        // Adjust tick interval based on zoom level
        let tickInterval;
        if(zoomScale > 5) {
            tickInterval = d3.timeWeek.every(1);
        } else if(zoomScale > 2) {
            tickInterval = d3.timeWeek.every(2);
        } else {
            tickInterval = d3.timeMonth.every(1);
        }
        
        // Update axis with new interval
        timelineAxis.ticks(tickInterval);
        
        // Apply transform and re-render
        timelineG.attr('transform', `translate(${-panOffset}, 0)`);
        timelineG.call(timelineAxis);
        
        // Re-style after update
        timelineG.selectAll('text')
            .style('font-size', '11px')
            .style('fill', 'var(--text)');
        
        timelineG.selectAll('line, path')
            .style('stroke', 'var(--text)');
    }
}

// Function to visualize line graphs
function visualizeLineGraphs(rootEl, resp, lineGraphPayload){
    if(!rootEl) return;
    
    rootEl.innerHTML = '';
    
    const txt = String(resp.csv || '').trim();
    if(!txt){ rootEl.textContent = 'Empty CSV'; return; }
    if(txt.startsWith('Error')){ rootEl.textContent = txt; return; }
    
    const rows = d3.csvParseRows(txt);
    if(!rows || rows.length < 2){ rootEl.textContent = 'Unexpected CSV format'; return; }
    
    // Parse data: first column is time labels, subsequent columns are attribute values
    const timeLabels = [];
        const datasets = {};
        
        // Get attribute names from first row (skip first cell which is header)
        const attributeNames = rows[0].slice(1);
        attributeNames.forEach(name => {
            datasets[name] = [];
        });
        
        // Parse data rows
        for(let r = 1; r < rows.length; r++){
            const timeLabel = rows[r][0];
            timeLabels.push(timeLabel);
            
            for(let c = 1; c < rows[r].length; c++){
                const val = parseFloat(rows[r][c]);
                const attrName = attributeNames[c - 1];
                datasets[attrName].push({
                    time: timeLabel,
                    value: isNaN(val) ? null : val
                });
            }
        }
        
        // Parse dates
        const dates = timeLabels.map(label => {
            const d = new Date(label);
            return isNaN(d.getTime()) ? null : d;
        }).filter(d => d !== null);
        
        if(dates.length === 0){ rootEl.textContent = 'No valid dates'; return; }
        
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        
        // Get heatmap width to match zoom
        const heatmapSection = document.getElementById('heatmap-section');
        const heatmapSvg = heatmapSection ? heatmapSection.querySelector('svg') : null;
        const svgW = heatmapSvg ? parseFloat(heatmapSvg.getAttribute('width')) : rootEl.clientWidth;
        
        // Create container for all line graphs
        const graphCount = attributeNames.length;
        const containerHeight = rootEl.clientHeight;
        const graphHeight = containerHeight / graphCount;
        
        const mainSvg = d3.create('svg')
            .attr('class', 'linegraphs-svg')
            .attr('width', '100%')
            .attr('height', '100%');
        
        // Create a group for each attribute
        attributeNames.forEach((attrName, idx) => {
            const data = datasets[attrName];
            
            // Find min/max for y scale
            const values = data.map(d => d.value).filter(v => v !== null);
            if(values.length === 0) return;
            
            const yMin = Math.min(...values);
            const yMax = Math.max(...values);
            
            // Create scales
            const xScale = d3.scaleTime()
                .domain([minDate, maxDate])
                .range([0, svgW]);
            
            const yScale = d3.scaleLinear()
                .domain([yMin, yMax])
                .range([graphHeight - 2, 2]);
            
            // Create group for this graph
            const graphG = mainSvg.append('g')
                .attr('class', `linegraph-${idx}`)
                .attr('transform', `translate(0, ${idx * graphHeight})`);
            
            // Background box
            graphG.append('rect')
                .attr('x', 0)
                .attr('y', 0)
                .attr('width', '100%')
                .attr('height', graphHeight)
                .attr('fill', 'var(--primary-dark)')
                .attr('stroke', 'var(--primary-light)')
                .attr('stroke-width', 1);
            
            // Create zoomable content group
            const contentG = graphG.append('g')
                .attr('class', 'linegraph-content');
            
            // Line generator
            const line = d3.line()
                .defined(d => d.value !== null)
                .x((d, i) => xScale(dates[i]))
                .y(d => yScale(d.value));
            
            // Draw line
            contentG.append('path')
                .datum(data)
                .attr('fill', 'none')
                .attr('stroke', 'var(--primary-contrast)')
                .attr('stroke-width', 2)
                .attr('d', line);
            
            // Label
            graphG.append('text')
                .attr('x', 5)
                .attr('y', 15)
                .attr('text-anchor', 'start')
                .style('font-size', '12px')
                .style('font-weight', 'bold')
                .style('fill', 'var(--primary-contrast)')
                .text(attrName);
        });
        
        rootEl.appendChild(mainSvg.node());
        
        // Store references for zoom updates
        rootEl._lineGraphData = {
            svg: mainSvg,
            dates: dates,
            minDate: minDate,
            maxDate: maxDate,
            svgW: svgW,
            datasets: datasets,
            attributeNames: attributeNames,
            graphHeight: graphHeight
        };
}

// Function to update line graphs on zoom
function updateLineGraphs(lineGraphSection, zoomScale, panOffset, svgW){
    if(!lineGraphSection || !lineGraphSection._lineGraphData) return;
    
    const data = lineGraphSection._lineGraphData;
    const { dates, minDate, maxDate, datasets, attributeNames, graphHeight } = data;
    
    // Update x scale with zoom
    const xScale = d3.scaleTime()
        .domain([minDate, maxDate])
        .range([0, svgW * zoomScale]);
    
    const svg = d3.select(lineGraphSection).select('svg');
    
    attributeNames.forEach((attrName, idx) => {
        const graphData = datasets[attrName];
        const values = graphData.map(d => d.value).filter(v => v !== null);
        if(values.length === 0) return;
        
        const yMin = Math.min(...values);
        const yMax = Math.max(...values);
        
        const yScale = d3.scaleLinear()
            .domain([yMin, yMax])
            .range([graphHeight - 2, 2]);
        
        const line = d3.line()
            .defined(d => d.value !== null)
            .x((d, i) => xScale(dates[i]))
            .y(d => yScale(d.value));
        
        const contentG = svg.select(`.linegraph-${idx} .linegraph-content`);
        
        // Apply transform
        contentG.attr('transform', `translate(${-panOffset}, 0)`);
        
        // Update line
        contentG.select('path')
            .attr('d', line);
    });
}

// Setup vertical time ruler across right column
(function setupTimeRuler() {
    const chartContainer = document.getElementById('chart-container');
    if(!chartContainer) return;
    
    // Create ruler line element
    const ruler = document.createElement('div');
    ruler.id = 'time-ruler';
    ruler.style.position = 'absolute';
    ruler.style.width = '1px';
    ruler.style.backgroundColor = 'white';
    ruler.style.pointerEvents = 'none';
    ruler.style.display = 'none';
    ruler.style.zIndex = '10000';
    chartContainer.appendChild(ruler);
    
    // Container for value readouts
    const readoutsContainer = document.createElement('div');
    readoutsContainer.id = 'ruler-readouts';
    readoutsContainer.style.position = 'absolute';
    readoutsContainer.style.pointerEvents = 'none';
    readoutsContainer.style.display = 'none';
    readoutsContainer.style.zIndex = '10001';
    chartContainer.appendChild(readoutsContainer);
    
    // Right column sections
    const rightColumnSections = [
        'slider-section',
        'heatmap-section',
        'timescale-section',
        'linegraph-section'
    ];
    
    function updateRuler(event) {
        const chartRect = chartContainer.getBoundingClientRect();
        const headerHeight = document.getElementById('header').getBoundingClientRect().height;
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        
        // Check if mouse is in any of the right column sections
        let isInRightColumn = false;
        
        for(const sectionId of rightColumnSections) {
            const section = document.getElementById(sectionId);
            if(!section) continue;
            
            const rect = section.getBoundingClientRect();
            if(mouseX >= rect.left && mouseX <= rect.right &&
               mouseY >= rect.top && mouseY <= rect.bottom) {
                isInRightColumn = true;
                break;
            }
        }
        
        if(isInRightColumn) {
            ruler.style.display = 'block';
            ruler.style.left = mouseX + 'px';
            ruler.style.top = (chartRect.top - headerHeight) + 'px';
            ruler.style.height = chartRect.height + 'px';
            
            // Update value readouts for line graphs
            updateValueReadouts(mouseX);
        } else {
            ruler.style.display = 'none';
            readoutsContainer.style.display = 'none';
        }
    }
    
    function updateValueReadouts(mouseX) {
        const lineGraphSection = document.getElementById('linegraph-section');
        if(!lineGraphSection || !lineGraphSection._lineGraphData) {
            readoutsContainer.style.display = 'none';
            return;
        }
        
        const data = lineGraphSection._lineGraphData;
        const { dates, minDate, maxDate, datasets, attributeNames, graphHeight, svgW } = data;
        
        // Get current zoom state from heatmap
        const heatmapSection = document.getElementById('heatmap-section');
        const heatmapSvg = heatmapSection ? heatmapSection.querySelector('svg') : null;
        const currentSvgW = heatmapSvg ? parseFloat(heatmapSvg.getAttribute('width')) : svgW;
        
        // Get zoom and pan from stored state (we need access to these)
        // For now, calculate x position relative to line graph section
        const lineGraphRect = lineGraphSection.getBoundingClientRect();
        const relativeX = mouseX - lineGraphRect.left;
        
        // Calculate which date index we're at
        // We need to account for zoom - get the actual width being used
        const xScale = d3.scaleTime()
            .domain([minDate, maxDate])
            .range([0, currentSvgW]);
        
        // Find closest date
        const mouseDate = xScale.invert(relativeX);
        let closestIdx = 0;
        let minDiff = Infinity;
        dates.forEach((d, i) => {
            const diff = Math.abs(d - mouseDate);
            if(diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
        });
        
        // Clear previous readouts
        readoutsContainer.innerHTML = '';
        readoutsContainer.style.display = 'block';
        
        // Create readout for each line graph
        attributeNames.forEach((attrName, idx) => {
            const graphData = datasets[attrName];
            const dataPoint = graphData[closestIdx];
            
            if(!dataPoint || dataPoint.value === null || isNaN(dataPoint.value)) return;
            
            // Calculate Y position for this graph
            const graphTopY = lineGraphRect.top + (idx * graphHeight);
            
            // Find the actual y coordinate of the value
            const values = graphData.map(d => d.value).filter(v => v !== null);
            const yMin = Math.min(...values);
            const yMax = Math.max(...values);
            const yScale = d3.scaleLinear()
                .domain([yMin, yMax])
                .range([graphHeight - 2, 2]);
            
            const valueY = graphTopY + yScale(dataPoint.value);
            
            // Create readout element
            const readout = document.createElement('div');
            readout.style.position = 'absolute';
            readout.style.left = (mouseX - 20) + 'px';
            readout.style.top = (valueY - 70) + 'px';
            readout.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            readout.style.color = 'white';
            readout.style.padding = '2px 6px';
            readout.style.borderRadius = '3px';
            readout.style.fontSize = '11px';
            readout.style.whiteSpace = 'nowrap';
            readout.textContent = dataPoint.value.toFixed(2);
            
            readoutsContainer.appendChild(readout);
        });
    }
    
    function hideRuler() {
        ruler.style.display = 'none';
        readoutsContainer.style.display = 'none';
    }
    
    // Add listeners to all right column sections
    for(const sectionId of rightColumnSections) {
        const section = document.getElementById(sectionId);
        if(section) {
            section.addEventListener('mousemove', updateRuler);
            section.addEventListener('mouseleave', hideRuler);
        }
    }
})();