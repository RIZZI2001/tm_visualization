async function visualizeHeatMap() {
    // FUNCTIONS
    function clearExpanded(){
        // Clear any pending fetch timeout
        if(fetchTimeout !== null){
            clearTimeout(fetchTimeout);
            fetchTimeout = null;
        }
        // Show the original title in the label section
        if (activeExpanded !== null) {
            const labelGroup = d3.select(yLabelGroups.nodes()[activeExpanded]);
            labelGroup.selectAll(':scope > text').style('display', 'block');
        }
        // Remove overlay SVG for expanded row title
        if (expandedTitleOverlaySVG) {
            expandedTitleOverlaySVG.remove();
            expandedTitleOverlaySVG = null;
        }
        movedMainText = null;
        
        // Remove any mini groups and restore layout for active topics
        rowGroups.selectAll('g.mini').remove();
        rowGroups.selectAll('rect').attr('display', null);
        // Clear 1D heatmap cells (but keep background rect) and place labels
        yLabelGroups.selectAll('g.place-heatmap-bg').selectAll('rect:not(.bg-rect)').remove();
        yLabelGroups.selectAll('g.place-labels').remove();
        yLabelGroups.selectAll('g.vertical-timeline').remove();

        // Recompute layout for active topics
        applyActiveTopicsLayout();

        mainHeatmapSVG.transition().duration(SPECS.fetchDelayExpandedRow)
            .attr('height', heatMapSection.clientHeight)
            .attr('viewBox', `0 0 ${heatMapSection.clientWidth} ${heatMapSection.clientHeight}`);
        if(yLabelsSVG) yLabelsSVG.transition().duration(SPECS.fetchDelayExpandedRow).attr('height', yLabelSection.clientHeight);

        activeExpanded = null;
        expandedRowBounds = null;
        clearCellHighlight();
        updateLegendValues('main');
    }
    
    function clearCellHighlight(){
        if(highlightCell) {
            highlightCell.style.display = 'none';
        }
        hoveredCell = null;
        hoveredCellInfo = null;
    }

    function setScreenHighlight(screenRect){
        if(!screenRect || !highlightCell) return;
        highlightCell.style.left = Math.round(screenRect.left) + 'px';
        highlightCell.style.top = Math.round(screenRect.top) + 'px';
        highlightCell.style.width = Math.max(0, Math.round(screenRect.width)) + 'px';
        highlightCell.style.height = Math.max(0, Math.round(screenRect.height)) + 'px';
        highlightCell.style.display = 'block';
    }
    
    // Global function to recalculate and update highlight position based on stored cell info
    // Called during zoom/pan operations to keep highlight synchronized
    function updateHighlightPosition(){
        if(!hoveredCellInfo || !highlightCell) return;
        
        const heatmapRect = mainHeatmapSVG.node().getBoundingClientRect();
        let cellW, cellH, localX, localY, screenTop;
        
        if(hoveredCellInfo.type === 'mini'){
            // Mini heatmap cell
            const miniRects = d3.select(rowGroups.nodes()[hoveredCellInfo.expandedRowIdx]).select('g.mini').selectAll('rect');
            if(miniRects.empty()) return clearCellHighlight();
            
            let maxCol = 0, maxRow = 0;
            miniRects.each(function(){ const d = d3.select(this).datum(); if(d && d.col>maxCol) maxCol=d.col; if(d && d.row>maxRow) maxRow=d.row; });
            
            const baseCellW = heatMapSection.clientWidth / (maxCol + 1);
            const baseCellH = (expandedRowBounds ? expandedRowBounds.heatmapBottom - expandedRowBounds.heatmapTop : 0) / (maxRow + 1);
            
            // Calculate accumulated width accounting for custom cell sizes
            const cellSizesX = X_CATEGORY === 'place' ? PLACE_CELL_SIZES : TIME_CELL_SIZES;
            let accumulatedWidth = 0;
            for (let i = 0; i < hoveredCellInfo.colIdx; i++) {
                accumulatedWidth += baseCellW * (cellSizesX && cellSizesX[i] ? cellSizesX[i] : 1);
            }
            cellW = baseCellW * (cellSizesX && cellSizesX[hoveredCellInfo.colIdx] ? cellSizesX[hoveredCellInfo.colIdx] : 1);
            
            // Calculate accumulated height accounting for custom cell sizes
            const cellSizesY = Y_CATEGORY === 'place' ? PLACE_CELL_SIZES : TIME_CELL_SIZES;
            let accumulatedHeight = 0;
            for (let i = 0; i < hoveredCellInfo.rowIdx; i++) {
                accumulatedHeight += baseCellH * (cellSizesY && cellSizesY[i] ? cellSizesY[i] : 1);
            }
            cellH = baseCellH * (cellSizesY && cellSizesY[hoveredCellInfo.rowIdx] ? cellSizesY[hoveredCellInfo.rowIdx] : 1);
            
            localX = accumulatedWidth;
            localY = accumulatedHeight;
            screenTop = heatmapRect.top + (expandedRowBounds?.heatmapTop || 0) + localY;
        } else {
            // Main heatmap cell
            const rVisible = ACTIVE_TOPICS_MAIN.indexOf(hoveredCellInfo.rowIdx);
            if(rVisible === -1) return clearCellHighlight();
            
            cellW = heatMapSection.clientWidth / columnCount;
            cellH = heatMapSection.clientHeight / Math.max(1, ACTIVE_TOPICS_MAIN.length);
            localX = hoveredCellInfo.colIdx * cellW;
            localY = rVisible * cellH;
            screenTop = heatmapRect.top + localY;
        }
        
        setScreenHighlight({
            left: heatmapRect.left + (localX * ZOOM_MAIN - PAN_MAIN),
            top: screenTop,
            width: cellW * ZOOM_MAIN,
            height: cellH
        });
    }
    
    // Make updateHighlightPosition globally accessible
    window.updateHighlightPosition = updateHighlightPosition;
    
    function hideTooltip(){
        const tooltip = getHeatmapTooltip();
        tooltip.style('display', 'none');
    }
    
    function handleMouseMove(event) {
        const labelRect = yLabelSection.getBoundingClientRect();
        const heatmapRect = mainHeatmapSVG.node().getBoundingClientRect();
        
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        
        // Check if mouse is over Y labels section
        const isOverLabels = mouseX >= labelRect.left && mouseX <= labelRect.right &&
                             mouseY >= labelRect.top && mouseY <= labelRect.bottom;
        
        // Check if mouse is over heatmap section
        const isOverHeatmap = mouseX >= heatmapRect.left && mouseX <= heatmapRect.right &&
                              mouseY >= heatmapRect.top && mouseY <= heatmapRect.bottom;
        
        if (isOverLabels) {
            // Mouse is over labels - determine which row to expand
            handleYLabelsHover(event, labelRect);
            clearCellHighlight();
            hideTooltip();
            // Show vertical range if expanded row has vertical data
            if (activeExpanded !== null && VALUE_RANGES.label) {
                updateLegendValues('label');
            }
        } else if (isOverHeatmap) {
            // Mouse is over heatmap - handle cell highlighting and expansion
            handleHeatmapHover(event, heatmapRect);
            // Update legend based on whether we're over expanded mini heatmap or main
            const mouseRelY = mouseY - heatmapRect.top;
            const isOverExpanded = activeExpanded !== null && expandedRowBounds && 
                                   mouseRelY >= expandedRowBounds.heatmapTop && 
                                   mouseRelY <= expandedRowBounds.heatmapBottom;
            if (isOverExpanded && VALUE_RANGES.expanded) {
                updateLegendValues('expanded');
            } else {
                updateLegendValues('main');
            }
        } else {
            // Mouse is outside both areas - clear everything
            clearCellHighlight();
            hideTooltip();
            if (activeExpanded !== null) {
                clearExpanded();
            }
            // Reset legend to main range
            updateLegendValues('main');
        }
    }
    
    function handleYLabelsHover(event, labelRect) {
        
        const relativeY = event.clientY - labelRect.top;
        const labelHeight = labelRect.height;
        
        // Map mouse to index among active topics
        const vcount = Math.max(1, ACTIVE_TOPICS_MAIN.length);
        const idxVisible = Math.floor((relativeY / labelHeight) * vcount);
        const clampedVisible = Math.max(0, Math.min(idxVisible, vcount - 1));
        const actualRow = ACTIVE_TOPICS_MAIN[clampedVisible];
        // Expand this row if it's not already expanded
        if (actualRow !== undefined && actualRow !== activeExpanded) {
            expandRow(actualRow);
        }
    }
    
    function handleHeatmapHover(event, heatmapRect) {
        const mouseX = event.clientX - heatmapRect.left;
        const mouseY = event.clientY - heatmapRect.top;
        
        highlightAt(mouseX, mouseY, heatmapRect);
        // Collapse expanded row if leaving expanded band
        if (!(activeExpanded !== null && expandedRowBounds && mouseY >= expandedRowBounds.heatmapTop && mouseY <= expandedRowBounds.heatmapBottom) && activeExpanded !== null) {
            clearExpanded();
        }
    }
    
    // Unified highlight for both main and mini grids. mouseX/mouseY are relative to heatmapRect top-left.
    function highlightAt(mouseX, mouseY, heatmapRect){
        if(!heatmapRect) return clearCellHighlight();

        // If we're over an expanded row and there's a mini grid, prefer that
        const overExpanded = activeExpanded !== null && expandedRowBounds && mouseY >= expandedRowBounds.heatmapTop && mouseY <= expandedRowBounds.heatmapBottom;
        if(overExpanded){
            const expandedGroup = d3.select(rowGroups.nodes()[activeExpanded]);
            const miniRects = expandedGroup.select('g.mini').selectAll('rect');
            if(!miniRects.empty()){
                // compute mini grid dims
                let maxCol = 0, maxRow = 0;
                miniRects.each(function(){ const d = d3.select(this).datum(); if(d){ if(d.col>maxCol) maxCol=d.col; if(d.row>maxRow) maxRow=d.row; }});
                const cols = maxCol+1; const rows = maxRow+1;
                const expandedH = expandedRowBounds.heatmapBottom - expandedRowBounds.heatmapTop;
                const baseCellW = heatMapSection.clientWidth / cols;
                const baseCellH = expandedH / rows;
                const transformedX = (mouseX + PAN_MAIN)/ZOOM_MAIN;
                
                // Find column with PLACE_CELL_SIZES or TIME_CELL_SIZES consideration for X axis
                let c = 0;
                let cellW = baseCellW;
                let screenLeft = heatmapRect.left;
                if ((X_CATEGORY === 'place' && PLACE_CELL_SIZES && PLACE_CELL_SIZES.length > 0) || (X_CATEGORY === 'time' && TIME_CELL_SIZES && TIME_CELL_SIZES.length > 0)) {
                    const cellSizes = X_CATEGORY === 'place' ? PLACE_CELL_SIZES : TIME_CELL_SIZES;
                    let accumulatedWidth = 0;
                    for (let i = 0; i < cols; i++) {
                        const cellWidth = baseCellW * (cellSizes[i] || 1);
                        if (transformedX < accumulatedWidth + cellWidth) {
                            c = i;
                            cellW = cellWidth;
                            screenLeft = heatmapRect.left + (accumulatedWidth * ZOOM_MAIN - PAN_MAIN);
                            break;
                        }
                        accumulatedWidth += cellWidth;
                    }
                    if (c >= cols - 1) c = cols - 1;
                } else {
                    c = Math.floor(transformedX / baseCellW);
                    c = Math.max(0, Math.min(cols - 1, c));
                    cellW = baseCellW;
                    screenLeft = heatmapRect.left + (c * baseCellW * ZOOM_MAIN - PAN_MAIN);
                }
                
                // Find row with PLACE_CELL_SIZES or TIME_CELL_SIZES consideration for Y axis
                let r = 0;
                let cellH = baseCellH;
                let screenTop = heatmapRect.top + expandedRowBounds.heatmapTop;
                const mouseYRelative = mouseY - expandedRowBounds.heatmapTop;
                const cellSizes = Y_CATEGORY === 'place' ? PLACE_CELL_SIZES : TIME_CELL_SIZES;
                let accumulatedHeight = 0;
                for (let i = 0; i < rows; i++) {
                    const cellHeight = baseCellH * (cellSizes[i] || 1);
                    if (mouseYRelative < accumulatedHeight + cellHeight) {
                        r = i;
                        cellH = cellHeight;
                        screenTop = heatmapRect.top + expandedRowBounds.heatmapTop + accumulatedHeight;
                        break;
                    }
                    accumulatedHeight += cellHeight;
                }
                if (r >= rows - 1) r = rows - 1;
                
                if(c<0||c>=cols||r<0||r>=rows) return clearCellHighlight();

                // find datum
                let found = null;
                miniRects.each(function(){ const d = d3.select(this).datum(); if(d && d.row===r && d.col===c) found = d; });
                if(!found) return clearCellHighlight();

                const screenRect = { left: screenLeft, top: screenTop, width: cellW*ZOOM_MAIN, height: cellH, right: screenLeft + cellW*ZOOM_MAIN, bottom: screenTop + cellH };

                const key = `mini-${r}-${c}`;
                if(hoveredCell !== key){ hoveredCell = key; clearCellHighlight(); }
                hoveredCellInfo = { type: 'mini', rowIdx: r, colIdx: c, expandedRowIdx: activeExpanded };
                setScreenHighlight(screenRect);
                const rowLabel = miniRowLabels[found.row] || 'Unknown';
                const colLabel = colLabels[found.col] || 'Unknown';
                showTooltip(rowLabel, colLabel, found.value, false, screenRect);
                return;
            }
        }

        // Fall back to main grid (map mouse Y into active topics only)
        const cols = columnCount;
        const vcount = Math.max(1, ACTIVE_TOPICS_MAIN.length);
        const baseCellW = heatMapSection.clientWidth / cols;
        const cellH = heatMapSection.clientHeight / vcount;
        const transformedX = (mouseX + PAN_MAIN)/ZOOM_MAIN;
        
        // Find column with PLACE_CELL_SIZES or TIME_CELL_SIZES consideration if X_CATEGORY is 'place' or 'time'
        let cIdx = 0;
        let cellW = baseCellW;
        let screenLeft = heatmapRect.left;
        if ((X_CATEGORY === 'place' && PLACE_CELL_SIZES && PLACE_CELL_SIZES.length > 0) || (X_CATEGORY === 'time' && TIME_CELL_SIZES && TIME_CELL_SIZES.length > 0)) {
            const cellSizes = X_CATEGORY === 'place' ? PLACE_CELL_SIZES : TIME_CELL_SIZES;
            let accumulatedWidth = 0;
            for (let i = 0; i < cols; i++) {
                const colWidth = baseCellW * (cellSizes[i] || 1);
                if (transformedX < accumulatedWidth + colWidth) {
                    cIdx = i;
                    cellW = colWidth;
                    screenLeft = heatmapRect.left + (accumulatedWidth * ZOOM_MAIN - PAN_MAIN);
                    break;
                }
                accumulatedWidth += colWidth;
            }
            if (cIdx >= cols - 1) cIdx = cols - 1;
        } else {
            cIdx = Math.floor(transformedX / baseCellW);
            cIdx = Math.max(0, Math.min(cols - 1, cIdx));
            cellW = baseCellW;
            screenLeft = heatmapRect.left + (cIdx * baseCellW * ZOOM_MAIN - PAN_MAIN);
        }
        
        const rVisible = Math.floor(mouseY / cellH);
        if(cIdx<0||cIdx>=cols||rVisible<0||rVisible>=vcount) return clearCellHighlight();

        const rIdx = ACTIVE_TOPICS_MAIN[rVisible];
        if(rIdx === undefined) return clearCellHighlight();

        // get datum
        const rowGroup = d3.select(rowGroups.nodes()[rIdx]);
        const rects = rowGroup.selectAll('rect');
        const node = rects.nodes()[cIdx];
        if(!node) return clearCellHighlight();
        const datum = d3.select(node).datum();

        const screenTop = heatmapRect.top + rVisible * cellH;
        const screenRect = { left: screenLeft, top: screenTop, width: cellW*ZOOM_MAIN, height: cellH, right: screenLeft + cellW*ZOOM_MAIN, bottom: screenTop + cellH };

        const key = `main-${rIdx}-${cIdx}`;
        if(hoveredCell !== key){ hoveredCell = key; clearCellHighlight(); }
        hoveredCellInfo = { type: 'main', rowIdx: rIdx, colIdx: cIdx };
        setScreenHighlight(screenRect);
        const rowLabel = rowLabels[rIdx] || 'Unknown';
        const colLabel = colLabels[datum.col] || 'Unknown';
        showTooltip(rowLabel, colLabel, datum.value, true, screenRect);
    }
    
    /**
     * Show tooltip with cell information
     */
    function showTooltip(rowLabel, colLabel, value, isCollapsed, cellRect) {
        const tooltip = getHeatmapTooltip();
        const valueStr = !isNaN(value) ? value.toFixed(3) : 'N/A';
        
        let content = '';
        
        if (AXES_SWAPPED) {
            const placeName = SPECS.showPlaceNameLabels ? SITE_NAMES[parseInt(colLabel.replace('s', '')) -1] : colLabel;
            if (isCollapsed) {
                // Collapsed: showing topic, colLabel is place
                content += `${nameOfTopic(rowLabel)}<br>`;
                content += `<strong>Place:</strong> ${placeName}<br><strong>Value:</strong> ${valueStr}`;
            } else {
                // Expanded mini heatmap: rowLabel is time, colLabel is place
                const formattedDate = formatDate(rowLabel);
                content += `<strong>Date:</strong> ${formattedDate}<br>`;
                content += `<strong>Place:</strong> ${placeName}<br><strong>Value:</strong> ${valueStr}`;
            }
        } else {
            // Normal: columns are dates, rows in mini are places
            const formattedDate = formatDate(colLabel);
            if (isCollapsed) {
                // Collapsed: showing topic, colLabel is date
                content += `${nameOfTopic(rowLabel)}<br>`;
                content += `<strong>Date:</strong> ${formattedDate}<br><strong>Value:</strong> ${valueStr}`;
            } else {
                // Expanded mini heatmap: rowLabel is site/place, colLabel is date
                const placeName = SPECS.showPlaceNameLabels ? SITE_NAMES[parseInt(rowLabel.replace('s', '')) -1] : rowLabel;
                content += `<strong>Place:</strong> ${placeName}<br>`;
                content += `<strong>Date:</strong> ${formattedDate}<br><strong>Value:</strong> ${valueStr}`;
            }
        }
        
        const nearRightEdge = cellRect.right > window.innerWidth * 0.9;
        
        // Update tooltip content and show it
        tooltip.html(content).style('display', 'block');
        
        // Position tooltip after updating content so we can measure its width
        const tooltipWidth = tooltip.node().offsetWidth;
        const leftPos = nearRightEdge 
            ? (cellRect.left - tooltipWidth - 5) + 'px'
            : (cellRect.right + 5) + 'px';
        
        tooltip.style('left', leftPos)
            .style('top', (cellRect.top + 5) + 'px');
    }
    
    function expandRow(i){
        if(i < 0 || i >= rowCount || ACTIVE_SITES.length <= 1) return;
        
        // Clear any pending fetch timeout
        if(fetchTimeout !== null){
            clearTimeout(fetchTimeout);
            fetchTimeout = null;
        }
        
        // Clear previous expansion if switching to a different row
        if(activeExpanded !== null && activeExpanded !== i){
            // Show previous title and remove overlay
            const prevLabelGroup = d3.select(yLabelGroups.nodes()[activeExpanded]);
            prevLabelGroup.selectAll(':scope > text').style('display', 'block');
            if (expandedTitleOverlaySVG) {
                expandedTitleOverlaySVG.remove();
                expandedTitleOverlaySVG = null;
            }
            movedMainText = null;
            
            // Clean up the previously expanded row's labels
            prevLabelGroup.selectAll('g.place-heatmap-bg').selectAll('rect:not(.bg-rect)').remove();
            prevLabelGroup.selectAll('g.place-labels').remove();
            prevLabelGroup.selectAll('g.vertical-timeline').remove();
            
            rowGroups.selectAll('g.mini').remove();
        }
        
        activeExpanded = i;
        
        // Hide the original title immediately when expansion starts
        if (yLabelGroups) {
            const labelGroup = d3.select(yLabelGroups.nodes()[i]);
            labelGroup.selectAll(':scope > text').style('display', 'none');
        }

        // Compute layout using active topics so expanded row scales correctly
        const miniRowCount = Y_CATEGORY === 'place' ? ACTIVE_SITES.length : ACTIVE_DATES.length;
        const totalRowCount = miniRowCount + ACTIVE_TOPICS_MAIN.length - 1; // minus 1 because expanded row is replaced by mini rows
        const expandedRatio = Math.sqrt(miniRowCount / totalRowCount) * 2/3; 
        const expandedH = expandedRatio * heatMapSection.clientHeight;
        const smallH = Math.max(1, (heatMapSection.clientHeight - expandedH) / Math.max(1, ACTIVE_TOPICS_MAIN.length - 1));

        // compute new y positions for full row list (invisible rows get 0 height)
        const heights = new Array(rowCount).fill(0);
        let cur = 0;
        for(let vi=0; vi<ACTIVE_TOPICS_MAIN.length; vi++){
            const r = ACTIVE_TOPICS_MAIN[vi];
            const h = (r === i) ? expandedH : smallH;
            heights[r] = h;
        }
        const yPos = [];
        for(let r=0;r<rowCount;r++){ yPos.push(cur); cur += heights[r] || 0; }

        // Store the expanded row bounds for accurate mouse tracking
        expandedRowBounds = {
            heatmapTop: yPos[i],
            heatmapBottom: yPos[i] + heights[i]
        };

        // Apply new positions and heights
        rowGroups.each(function(_,idx){
            d3.select(this)
                .transition().duration(SPECS.fetchDelayExpandedRow)
                .attr('transform', `translate(0, ${yPos[idx]})`)
            d3.select(this).selectAll('rect')
                .transition().duration(SPECS.fetchDelayExpandedRow)
                .attr('height', heights[idx]);
        });

        mainHeatmapSVG.transition().duration(SPECS.fetchDelayExpandedRow)
            .attr('height', cur)
            .attr('viewBox', `0 0 ${heatMapSection.clientWidth} ${cur}`);
        rowGroups.selectAll('rect').attr('display', null);
        rowGroups.selectAll('g.mini').remove();
        
        // Sync label boxes with row expansion
        if(yLabelGroups && yLabelsSVG){
            const labelContainerH = yLabelSection.clientHeight;
            const scaleFactor = labelContainerH / heatMapSection.clientHeight;
            const labelHeights = heights.map(h => h * scaleFactor);
            const labelYPos = yPos.map(y => y * scaleFactor);
            
            yLabelGroups.each(function(_,idx){
                d3.select(this)
                    .transition().duration(SPECS.fetchDelayExpandedRow)
                    .attr('transform', `translate(0, ${labelYPos[idx]})`);
                d3.select(this).select('.label-border')
                    .transition().duration(SPECS.fetchDelayExpandedRow)
                    .attr('height', labelHeights[idx]);
                // Update background rect height
                d3.select(this).select('g.place-heatmap-bg .bg-rect')
                    .transition().duration(SPECS.fetchDelayExpandedRow)
                    .attr('height', labelHeights[idx]);
            });
            
            const newLabelH = labelYPos[labelYPos.length - 1] + labelHeights[labelHeights.length - 1];
            yLabelsSVG.transition().duration(SPECS.fetchDelayExpandedRow).attr('height', newLabelH);
        }

        // Only fetch detail CSV if row stays expanded for at least 150ms
        fetchTimeout = setTimeout(() => {
            fetchTimeout = null;
            
            // Check if this row is still the active expanded row
            if(activeExpanded !== i) return;
            
            const topicVal = rowLabels[i];
            
            let locationNames;
            if(SPECS.showPlaceNameLabels) {
                //Go through ACTIVE_SITES and fetch names from SITE_NAMES
                locationNames = ACTIVE_SITES.map(siteId => {
                    return SITE_NAMES[siteId - 1];
                });
            }
            
            // Generate fresh payload with current ACTIVE_SITES state
            const currentPayload = generateMainHeatMapPayload();

            // Fetch averaged place data for 1D heatmap background
            const avgPayload = generatePayload(currentPayload, {
                id: { type: 'single', value: topicVal },
                average: X_CATEGORY
            });
            
            fetchCSVData(avgPayload).then(avgResp => {
                if (!avgResp || !avgResp.csv || activeExpanded !== i) return;
                
                const avgRows = d3.csvParseRows(String(avgResp.csv).trim());
                if(!avgRows || avgRows.length < 2) return;
                
                // Parse averaged values and place labels
                const avgVals = [];
                const avgLabels = [];
                for(let r=1; r<avgRows.length; r++){
                    // First column is the place label
                    avgLabels.push(avgRows[r][0] || '');
                    // Try all columns after the first (label) column for values
                    for(let c=1; c<avgRows[r].length; c++){
                        const v = parseFloat(avgRows[r][c]);
                        if(!isNaN(v)){
                            avgVals.push(v);
                            break; // Only take first valid value per row
                        }
                    }
                }

                if(Y_CATEGORY === 'time') {setActiveDates(avgLabels);}
                
                if(avgVals.length === 0 || activeExpanded !== i) return;
                
                VALUE_RANGES.label = { min: Math.min(...avgVals), max: Math.max(...avgVals) };
                const avgColor = createColorScale(VALUE_RANGES.label.min, VALUE_RANGES.label.max);
                updateLegendValues('label');
                
                // Render 1D heatmap in the label background
                if(yLabelGroups && activeExpanded === i){
                    const labelGroup = d3.select(yLabelGroups.nodes()[i]);
                    const bgGroup = labelGroup.select('g.place-heatmap-bg');
                    bgGroup.selectAll('rect:not(.bg-rect)').remove();
                    
                    const labelContainerH = yLabelSection.clientHeight;
                    const scaleFactor = labelContainerH / heatMapSection.clientHeight;
                    const expandedLabelH = expandedH * scaleFactor;
                    const cellH = expandedLabelH / avgVals.length;

                    let accHeight = 0;
                    const renderRows = avgVals.length;
                    const cellSizes = Y_CATEGORY === 'place' ? PLACE_CELL_SIZES : TIME_CELL_SIZES;

                    avgVals.forEach((val, idx) => {
                        const customCellHeight = cellH  * cellSizes[idx];
                        accHeight += customCellHeight;
                        bgGroup.append('rect')
                            .attr('x', 0)
                            .attr('y', accHeight - customCellHeight)
                            .attr('width', '100%')
                            .attr('height', customCellHeight)
                            .attr('fill', avgColor(val))
                            .attr('opacity', 1)
                            .attr('stroke', 'none');
                    });
                    
                    // Move background group to back so it's behind border and text
                    labelGroup.node().insertBefore(bgGroup.node(), labelGroup.node().firstChild);
                    
                    // Add vertical timeline if axes are swapped (replaces place labels)
                    if(AXES_SWAPPED) {
                        const labelGroup = d3.select(yLabelGroups.nodes()[i]);

                        const timelineX = yLabelSection.clientWidth;
                        const verticalTimeline = createTimeline(avgLabels, timelineX, expandedH, true);
                        
                        // Create container for vertical timeline in labels section
                        const timelineGroup = labelGroup.selectAll('g.vertical-timeline').data([null]);
                        const timelineEnter = timelineGroup.enter().append('g').attr('class', 'vertical-timeline');
                        const timelineG = timelineGroup.merge(timelineEnter);
                        timelineG.selectAll('*').remove();
                        
                        const scaleFactor = labelContainerH / heatMapSection.clientHeight;
                        const expandedLabelH = expandedH * scaleFactor;
                        
                        timelineG.append(() => verticalTimeline.svg.node())
                            .attr('transform', `translate(${timelineX - 82}, 0) scale(1, ${expandedLabelH / expandedH})`);
                    } else {
                        const placeLabelsGroup = labelGroup.selectAll('g.place-labels').data([null]);
                        const placeLabelsEnter = placeLabelsGroup.enter().append('g').attr('class', 'place-labels');
                        const placeLabelsG = placeLabelsGroup.merge(placeLabelsEnter);
                        placeLabelsG.selectAll('*').remove();

                        accHeight = 0;
                        const labelCellSizes = Y_CATEGORY === 'place' ? PLACE_CELL_SIZES : (Y_CATEGORY === 'time' ? TIME_CELL_SIZES : null);

                        avgLabels.forEach((label, idx) => {
                            const customCellHeight = cellH  * labelCellSizes[idx];
                            accHeight += customCellHeight;
                            const placeFontSize = Math.max(8, Math.min(customCellHeight * 0.9, 16));
                            // Use location name if available, otherwise fall back to original label
                            const displayLabel = (locationNames && locationNames[idx]) ? locationNames[idx] : label;
                            const textColor = hexToLightness(avgColor(avgVals[idx])) > 40 ? '#000000' : '#ffffff';
                            const textElem = placeLabelsG.append('text')
                                .attr('x', '98%')
                                .attr('y', accHeight - customCellHeight * 0.65)
                                .attr('dy', '0.35em')
                                .attr('text-anchor', 'end')
                                .style('font-size', `${placeFontSize}px`)
                                .style('fill', textColor)
                                .style('pointer-events', 'none')
                                .style('max-width', `${yLabelSection.clientWidth * 0.9}px`)
                                .text(displayLabel);
                            
                            // Check if text overflows and reduce font size if needed
                            setTimeout(() => {
                                const textNode = textElem.node();
                                if (textNode && textNode.getComputedTextLength) {
                                    const textLength = textNode.getComputedTextLength();
                                    const maxLabelWidth = yLabelSection.clientWidth * 0.9;
                                    if (textLength > maxLabelWidth) {
                                        const scaleFactor = maxLabelWidth / textLength;
                                        const newFontSize = Math.min(16, Math.max(10, placeFontSize * scaleFactor));
                                        textElem.style('font-size', `${newFontSize}px`);
                                    }
                                }
                            }, 0);
                        });
                    }
                }
            }).catch(() => {});

            // Fetch detail data with place breakdown
            const detailPayload = generatePayload(currentPayload, {
                id: { type: 'single', value: topicVal },
                average: 'false'
            });
            
            fetchCSVData(detailPayload).then(detailResp => {
                if (!detailResp || !detailResp.csv || activeExpanded !== i) return;
                
                let miniRows = d3.csvParseRows(String(detailResp.csv).trim());
                if(AXES_SWAPPED) {
                    miniRows = transpose(miniRows);
                }

                const mCols = miniRows[0].length - 1;
                const mRows = miniRows.length - 1;
                if(mCols <= 0 || mRows <= 0) return;

                let miniMat = [];
                
                // Parse mini heatmap data
                let minVal = Infinity, maxVal = -Infinity;
                for(let r=1; r<miniRows.length; r++){
                    const row = [];
                    for(let c=1; c<miniRows[r].length; c++){
                        const v = parseFloat(miniRows[r][c]);
                        if(v < minVal) minVal = v;
                        if(v > maxVal) maxVal = v;
                        row.push(v);
                    }
                    miniMat.push(row);
                }
                
                VALUE_RANGES.expanded = { min: minVal, max: maxVal };
                const mcolor = createColorScale(VALUE_RANGES.expanded.min, VALUE_RANGES.expanded.max);

                if(activeExpanded !== i) return;
                const hoveredGroup = d3.select(rowGroups.nodes()[i]);
                hoveredGroup.selectAll('g.mini').remove();
                hoveredGroup.selectAll('rect').attr('display', 'none');
                const miniG = hoveredGroup.append('g').attr('class','mini');

                const renderCols = mRows;
                const renderRows = mCols;

                // Store mini-heatmap metadata for tooltip
                const miniLabelsY = [];
                for(let r=1; r<miniRows[0].length; r++){
                    miniLabelsY.push(miniRows[0][r]);
                }
                const miniLabelsX = [];
                for(let r=1; r<miniRows.length; r++){
                    miniLabelsX.push(miniRows[r][0]);
                }

                if(Y_CATEGORY === 'time') {setActiveDates(miniLabelsY);}
                
                // Store labels for tooltip access
                miniRowLabels = miniLabelsY;

                const mCellW = heatMapSection.clientWidth / renderCols;
                const mCellH = expandedH / renderRows;
                
                let accHeight = 0;
                let accWidth = 0;

                const miniYCellSizes = Y_CATEGORY === 'place' ? PLACE_CELL_SIZES : TIME_CELL_SIZES;
                const miniXCellSizes = X_CATEGORY === 'place' ? PLACE_CELL_SIZES : TIME_CELL_SIZES;

                for(let rr=0; rr<renderRows; rr++){
                    const customCellHeight = mCellH * miniYCellSizes[rr];
                    accHeight += customCellHeight;
                    for(let cc=0; cc<renderCols; cc++){
                        const customCellWidth = mCellW * miniXCellSizes[cc];
                        accWidth += customCellWidth;
                        const val = miniMat[cc][rr];
                        miniG.append('rect')
                            .attr('x', accWidth - customCellWidth)
                            .attr('y', accHeight - customCellHeight)
                            .attr('width', customCellWidth)
                            .attr('height', customCellHeight)
                            .attr('fill', !isNaN(val) ? mcolor(val) : '#707070ff')
                            .datum({row: rr, col: cc, value: val});
                    }
                    accWidth = 0;
                }
                
                // Create title overlay text for expanded row immediately
                if (yLabelGroups) {
                    const nlabelGroup = d3.select(yLabelGroups.nodes()[i]);
                    const mainTextNode = nlabelGroup.selectAll(':scope > text').node();
                    if (mainTextNode) {
                        // Create a small overlay SVG positioned only over the expanded mini heatmap
                        expandedTitleOverlaySVG = d3.create('svg')
                            .attr('class', 'expanded-title-overlay')
                            .attr('width', heatMapSection.clientWidth)
                            .attr('height', expandedH)
                            .style('position', 'absolute')
                            .style('top', yPos[i] + 'px')
                            .style('left', '0')
                            .style('pointer-events', 'none')
                            .style('overflow', 'visible');
                        
                        // Clone the text node and append to overlay
                        const textClone = mainTextNode.cloneNode(true);
                        expandedTitleOverlaySVG.node().appendChild(textClone);
                        
                        // Get the original font size
                        const originalFontSize = d3.select(mainTextNode).style('font-size');
                        
                        // Position the text at the top of the overlay
                        const textSelection = d3.select(textClone);
                        textSelection
                            .style('display', 'block')
                            .attr('x', 5)
                            .attr('y', 5)
                            .attr('text-anchor', 'start')
                            .style('font-size', originalFontSize)
                            .style('text-shadow', '1px 1px 2px #000000cc')
                            .style('fill', '#ffffff')
                            .style('pointer-events', 'auto')
                            .style('cursor', 'pointer');
                        
                        // Make text editable on double-click
                        textSelection.on('click', function() {
                            const currentText = d3.select(this).text();
                            
                            // Create input field positioned at same location as text
                            const input = document.createElement('input');
                            input.type = 'text';
                            input.value = currentText;
                            input.style.position = 'absolute';
                            input.style.top = (yPos[i] + 5) + 'px';
                            input.style.left = '5px';
                            input.style.width = 'auto';
                            input.style.height = 'auto';
                            input.style.fontSize = originalFontSize;
                            input.style.zIndex = '1001';
                            
                            heatMapSection.appendChild(input);
                            input.focus();
                            input.select();
                            
                            // Save on blur or Enter
                            const saveEdit = () => {
                                const newText = input.value || currentText;
                                d3.select(textClone).text(newText);
                                try{input.remove();}catch(e){}
                                const oldname = TOPIC_NAMES[TOPIC_SET][i];
                                renameTopic(i, textClone, oldname);
                            };
                            
                            input.addEventListener('blur', saveEdit);
                            input.addEventListener('keydown', (e) => {
                                if (e.key === 'Enter') saveEdit();
                                if (e.key === 'Escape') {
                                    input.remove();
                                }
                            });
                        });
                        
                        // Append overlay to heatmap section
                        heatMapSection.appendChild(expandedTitleOverlaySVG.node());
                        
                        // Store reference to clone for cleanup
                        movedMainText = textClone;
                    }
                }
                
                // Add border around mini heatmap (ensure dimensions are not negative)
                const borderWidth = Math.max(0, heatMapSection.clientWidth - 1);
                const borderHeight = Math.max(0, expandedH - 1);
                miniG.append('rect')
                    .attr('x', 0.5)
                    .attr('y', 0.5)
                    .attr('width', borderWidth)
                    .attr('height', borderHeight)
                    .attr('fill', 'none')
                    .attr('stroke', 'white')
                    .attr('stroke-width', 1)
                    .attr('pointer-events', 'none');
            }).catch(() => {});
        }, SPECS.fetchDelayExpandedRow); // Wait 150ms before fetching data
    }
    //===========================================================================================================================================================
    //MAIN SCRIPT
    //===========================================================================================================================================================
    ZOOM_MAIN = 1;
    PAN_MAIN = 0;

    heatMapSection = document.getElementById('heatmap-section');
    heatMapSection.innerHTML = '';
    // Ensure heatMapSection has position: relative for absolute positioned children
    heatMapSection.style.position = 'relative';

    // Clean up previous event listeners and observers to prevent accumulation
    chartContainer = document.getElementById('chart-container');
    xLabelSection = document.getElementById('x-Label-section');
    xLabelSection.innerHTML = '';
    lineGraphSection = document.getElementById('linegraph-section');
    
    // Clean up movement handlers if they exist from previous initialization
    if (heatMapSection._movementHandler) {
        heatMapSection._movementHandler.cleanup();
        heatMapSection._movementHandler = null;
    }
    
    // Disconnect chart observer
    if (chartContainer._chartSectionObserver) {
        chartContainer._chartSectionObserver.disconnect();
        chartContainer._chartSectionObserver = null;
    }
    
    // Remove mouse tracking listeners
    if (chartContainer._mouseMoveHandler) {
        chartContainer.removeEventListener('mousemove', chartContainer._mouseMoveHandler);
        chartContainer._mouseMoveHandler = null;
    }
    if (chartContainer._mouseLeaveHandler) {
        chartContainer.removeEventListener('mouseleave', chartContainer._mouseLeaveHandler);
        chartContainer._mouseLeaveHandler = null;
    }

    // Use persistent linegraph height if available, otherwise use default
    const storedLineGraphHeight = parseInt(localStorage.getItem('LINEGRAPH_HEIGHT'));
    const lineGraphHeight = storedLineGraphHeight && storedLineGraphHeight > 0 ? storedLineGraphHeight : 100;
    
    const heatmapHeight = chartContainer.clientHeight - (AXES_SWAPPED ? 40 : 0) - 50 - lineGraphHeight;
    heatMapSection.style.height = `${heatmapHeight}px`;

    const heatMapPayload = generateMainHeatMapPayload();
    const resp = await fetchCSVData(heatMapPayload);
    
    // Parse CSV
    const rows = parseAndValidateCSV(resp.csv);
    columnCount = rows.length - 1;

    const rowCount = rows[0].length - 1;
    
    // Variables for cell hover tracking
    let hoveredCell = null;
    let hoveredCellInfo = null; // Stores {type: 'main'|'mini', rowIdx, colIdx, expandedRowIdx}
    let miniRowLabels = [];
    
    // Store original cell width for zoom scaling
    originalCellWidth = heatMapSection.clientWidth / columnCount;

    // Parse numeric matrix and compute domain
    const dataMatrix = [];
    let vmin = Infinity;
    let vmax = -Infinity;

    // Build matrix column-wise (necessary for svg rendering later)
    for(let c=1; c<=rowCount; c++){
        const col = [];
        for(let r=1; r<=columnCount; r++){
            const v = parseFloat(rows[r][c]);
            col.push(v);
            if(!isNaN(v)) {
                if(v < vmin) vmin = v;
                if(v > vmax) vmax = v;
            }
        }
        dataMatrix.push(col);
    }

    // Extract labels for main heatmap
    let rowLabels = rows[0].slice(1);
    const colLabels = rows.slice(1).map(r => r[0]);

    if(X_CATEGORY === 'time') {
        setActiveDates(colLabels);
    } else if (Y_CATEGORY === 'time') {
        setActiveDates(resp.times);
    }

    // Compute cell dimensions
    const cellWidth = heatMapSection.clientWidth / columnCount;
    const cellHeight = heatMapSection.clientHeight / rowCount;

    mainHeatmapSVG = d3.create('svg')
        .attr('class', 'heatmap-svg')
        .attr('width', heatMapSection.clientWidth)
        .attr('height', heatMapSection.clientHeight)
        .attr('viewBox', `0 0 ${heatMapSection.clientWidth} ${heatMapSection.clientHeight}`)
        .attr('preserveAspectRatio', 'none')
        .attr('shape-rendering', 'crispEdges');

    // Color scale
    VALUE_RANGES.main = getValueRange(dataMatrix.flat());
    const color = createColorScale(VALUE_RANGES.main.min, VALUE_RANGES.main.max);

    // Render row labels in separate container
    const yLabelSection = document.getElementById('y-Label-section');
    let yLabelsSVG;
    yLabelSection.innerHTML = '';
    yLabelSection.style.height = `${heatmapHeight}px`;
    
    const yLabels = createYLabels(rowLabels, cellHeight, yLabelSection.clientHeight, yLabelSection.clientWidth);
    yLabelsSVG = yLabels.svg;
    yLabelGroups = yLabels.groups;
    yLabelSection.appendChild(yLabelsSVG.node());
    
    // Add click listeners to all y-labels to open detail view
    // These work regardless of whether the row can expand (i.e., when 0 or 1 sites selected)
    yLabelGroups.each(function(d, idx) {
        d3.select(this).on('click', function() {
            showDetailView('topic', true, [idx]);
        }).style('cursor', 'pointer');
    });

    // Build and render heatmap cells
    cellsG = mainHeatmapSVG.append('g')
        .attr('class', 'heatmap-cells');
    const rowsSel = cellsG.selectAll('g.row')
        .data(dataMatrix)
        .enter()
        .append('g')
        .attr('class','row')
        .attr('transform', (_,i) => `translate(0, ${i*cellHeight})`);
    

    let accWidth = 0;
    const cellSizes = X_CATEGORY === 'place' ? PLACE_CELL_SIZES : (X_CATEGORY === 'time' ? TIME_CELL_SIZES : null);

    // Add cells to each row using a loop
    rowsSel.each(function(rowData) {
        accWidth = 0; // Reset for each row
        rowData.forEach((d, i) => {
            const customCellWidth = cellWidth * (cellSizes && (columnCount > 1) ? (cellSizes[i] || 1) : 1);
            accWidth += customCellWidth;
            d3.select(this).append('rect')
                .attr('x', accWidth - customCellWidth)
                .attr('y', 0)
                .attr('width', customCellWidth)
                .attr('height', cellHeight)
                .attr('fill', !isNaN(d) ? color(d) : '#707070ff')
                .attr('stroke', 'none')
                .datum({col: i, value: d});
        });
    });

    // Row hover expansion behavior (value comes from frontend SPECS)
    let activeExpanded = null;
    let expandedRowBounds = null;
    let expandedTitleOverlaySVG = null; // Dynamically created overlay for expanded row title
    let movedMainText = null; // Track the text element that was moved to title overlay
    rowGroups = cellsG.selectAll('g.row');

    // Apply visibility based on activeTopics so deselected topics are hidden on re-initialization
    try {
        const rgNodes = rowGroups.nodes();
        rgNodes.forEach((rg, idx) => {
            if (!ACTIVE_TOPICS_MAIN.includes(idx)) {
                rg.style.display = 'none';
            } else {
                rg.style.display = null;
            }
        });
        if (yLabelGroups) {
            const yNodes = yLabelGroups.nodes();
            yNodes.forEach((yg, idx) => {
                if (!ACTIVE_TOPICS_MAIN.includes(idx)) {
                    yg.style.display = 'none';
                } else {
                    yg.style.display = null;
                }
            });
        }
    } catch(e){}

    let fetchTimeout = null;

    heatMapSection.appendChild(mainHeatmapSVG.node());

    // Apply initial layout for active topics (all selected by default)
    applyActiveTopicsLayout();

    // Get slider section before initializing movement handler
    sliderSection = document.getElementById('slider-section');
    
    // Create timeline based on axis orientation
    
    if (!AXES_SWAPPED) {
        const horizontalTimeline = createTimeline(colLabels, heatMapSection.clientWidth, xLabelSection.clientHeight, false);
        timelineDates = horizontalTimeline.dates;
        timelineScale = horizontalTimeline.scale;
        timelineAxis = horizontalTimeline.axis;
        timelineG = horizontalTimeline.g;
        xLabelSection.appendChild(horizontalTimeline.svg.node());
    } else {
        // Swapped: show place labels as equal-width boxes
        xLabelSection.innerHTML = '';
        xLabelSection.style.position = 'relative';
        
        const labelBoxes = createLabelBoxes(colLabels, heatMapSection.clientWidth, xLabelSection.clientHeight);
        xLabelSection.appendChild(labelBoxes.svg.node());
        
        // Add coordinate scale if latitude or longitude is selected
        if ((PLACE_CATEGORY === 'latitude' || PLACE_CATEGORY === 'longitude') && SPECS.scaleCellsByDistance) {
            const site1 = ACTIVE_SITES[0];
            const site2 = ACTIVE_SITES[ACTIVE_SITES.length - 1];
            const start = SITE_COORDS.find(item => item.siteId === site1)[PLACE_CATEGORY];
            const end = SITE_COORDS.find(item => item.siteId === site2)[PLACE_CATEGORY];

            const spanDeg = end - start;
            const middleSpacing = PLACE_SPACINGS_SUM - PLACE_SPACINGS[0] - PLACE_SPACINGS[PLACE_SPACINGS.length - 1];
            const extendBefore = spanDeg * PLACE_SPACINGS[0] / middleSpacing;
            const extendAfter = spanDeg * PLACE_SPACINGS[PLACE_SPACINGS.length - 1] / middleSpacing;
            
            const extendedStart = (start - extendBefore);
            const extendedEnd = (end + extendAfter);

            // Create separate positioned container for coordinate scale (overlay on top)
            const coordScaleContainer = document.createElement('div');
            coordScaleContainer.style.position = 'absolute';
            coordScaleContainer.style.top = '0';
            coordScaleContainer.style.left = '0';
            coordScaleContainer.style.width = '100%';
            coordScaleContainer.style.height = '100%';
            coordScaleContainer.style.zIndex = '10';
            coordScaleContainer.style.pointerEvents = 'auto';
            coordScaleContainer.style.overflow = 'hidden';
            
            const coordScale = createCoordScale(extendedStart, extendedEnd, heatMapSection.clientWidth, xLabelSection.clientHeight, false);
            const coordScaleSvg = coordScale.svg.node();
            coordScaleSvg.style.position = 'absolute';
            coordScaleSvg.style.width = '100%';
            coordScaleSvg.style.height = '100%';
            coordScaleContainer.appendChild(coordScaleSvg);
            xLabelSection.appendChild(coordScaleContainer);
            
            // Store coordScale reference globally for zoom/pan updates
            window.mainCoordScaleData = {
                scale: coordScale.scale,
                axis: coordScale.axis,
                g: d3.select(coordScaleSvg).select('.coordScale-content'),
                svg: coordScaleSvg
            };
        }
    }

    // Initialize movement handler for zoom, pan, and resizing
    const movementHandler = initializeMovement(
        updateLineGraphs
    );
    heatMapSection._movementHandler = movementHandler;
    
    // Attach mouse tracking to chart-container so it always tracks cursor position
    const handleMouseMoveWrapper = handleMouseMove;
    chartContainer._mouseMoveHandler = handleMouseMoveWrapper;
    chartContainer.addEventListener('mousemove', handleMouseMoveWrapper);
    
    const handleMouseLeaveWrapper = (event) => {
        // Clear everything when leaving the entire chart area
        clearCellHighlight();
        hideTooltip();
        if (activeExpanded !== null) {
            clearExpanded();
        }
    };
    chartContainer._mouseLeaveHandler = handleMouseLeaveWrapper;
    chartContainer.addEventListener('mouseleave', handleMouseLeaveWrapper);
    
    const chartSectionObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const chartHeight = entry.contentRect.height;
            const sliderHeight = sliderSection.clientHeight;
            const xLabelHeight = xLabelSection.clientHeight;
            const lineGraphHeight = lineGraphSection.clientHeight;
            const newHeatmapHeight = chartHeight - sliderHeight - xLabelHeight - lineGraphHeight;
            
            heatMapSection.style.height = `${newHeatmapHeight}px`;
            yLabelSection.style.height = `${newHeatmapHeight}px`;
            
            // Update grid template rows to ensure proper layout
            chartContainer.style.gridTemplateRows = `${sliderHeight}px ${newHeatmapHeight}px ${xLabelHeight}px ${lineGraphHeight}px`;
            
            // Update layout with new dimensions (no animation during resize)
            applyActiveTopicsLayout(false);
        }
    });
    chartSectionObserver.observe(chartContainer);
    chartContainer._chartSectionObserver = chartSectionObserver;
    
    // Render legend
    LEGEND_TEXT = createLegend(vmin, vmax);

    /* setTimeout(() => {
        expandRow(ACTIVE_TOPICS_MAIN[0]);
    }, 500); */
}