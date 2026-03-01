/**
 * Movement Handler Module
 * Handles all horizontal zooming, panning, and both horizontal/vertical resizing
 */

function applyD3Attr(selection, duration, attr, value, displayAttr = null) {
    if (duration > 0) {
        const trans = selection.transition().duration(duration);
        trans.attr(attr, value);
        if (displayAttr !== null) trans.attr('display', displayAttr);
    } else {
        selection.attr(attr, value);
        if (displayAttr !== null) selection.attr('display', displayAttr);
    }
}

/**
 * Apply layout based on active topics (vertical scaling)
 * Updates both heatmap and y-labels to fill available space
 * Unified function that works both locally and globally
 */
function applyActiveTopicsLayout(animate = true){
    try{
        const heatMapSection = document.getElementById('heatmap-section');
        if(!heatMapSection) return;
        const mainSvg = heatMapSection.querySelector('svg.heatmap-svg');
        if(!mainSvg) return;

        const rowGroupsSel = d3.select(mainSvg).selectAll('g.row');
        const rowNodes = rowGroupsSel.nodes();

        const vcount = Math.max(1, ACTIVE_TOPICS_MAIN.length);
        const rowH = heatMapSection.clientHeight / vcount;
        const duration = animate ? SPECS.fetchDelayExpandedRow : 0;

        // Position visible rows and hide others
        let cur = 0;
        rowNodes.forEach((rg, r) => {
            if(!rg) return;
            if(ACTIVE_TOPICS_MAIN.includes(r)){
                try{
                    rg.style.display = null;
                    const sel = d3.select(rg);
                    applyD3Attr(sel, duration, 'transform', `translate(0, ${cur})`);
                    applyD3Attr(sel.selectAll('rect'), duration, 'height', rowH, null);
                }catch(e){}
                cur += rowH;
            } else {
                try{ rg.style.display = 'none'; } catch(e){}
            }
        });

        // Update y-labels
        const yLabelSection = document.getElementById('y-Label-section');
        const ySvg = yLabelSection ? yLabelSection.querySelector('svg.labels-svg') : null;
        if(ySvg){
            const yGroups = d3.select(ySvg).selectAll('g.label-row').nodes();
            const scaleFactor = yLabelSection.clientHeight / heatMapSection.clientHeight;
            let curLabel = 0;
            yGroups.forEach((lg, idx) => {
                if(!lg) return;
                if(ACTIVE_TOPICS_MAIN.includes(idx)){
                    const lh = rowH * scaleFactor;
                    try{ lg.style.display = null; }catch(e){}
                    const sel = d3.select(lg);
                    applyD3Attr(sel, duration, 'transform', `translate(0, ${curLabel})`);
                    try{ applyD3Attr(sel.select('.label-border'), duration, 'height', lh); }catch(e){}
                    try{ applyD3Attr(sel.select('g.place-heatmap-bg .bg-rect'), duration, 'height', lh); }catch(e){}
                    curLabel += lh;
                } else {
                    try{ lg.style.display = 'none'; }catch(e){}
                }
            });
            applyD3Attr(d3.select(ySvg), duration, 'height', curLabel);
        }
    }catch(e){ console.error('applyActiveTopicsLayout failed', e); }
}

function initializeMovement(updateLineGraphs) {
    // Track width for pan offset scaling on resize - initialize lazily to avoid null reference
    let previousHeatmapWidth = heatMapSection ? heatMapSection.clientWidth : null;
    
    // Track drag state for vertical resizing
    let isDraggingXLabel = false;
    let isDraggingLineGraph = false;
    let startYXLabel = 0;
    let startYLineGraph = 0;

    // Track drag state for horizontal panning
    let isPanning = false;
    let panStartX = 0;
    let panStartOffset = 0;

    /**
     * Unified function to handle all horizontal zoom, pan, and resize updates
     * Updates heatmap cells, timeline, line graphs, mini heatmaps, and highlight box in sync
     */
    function update_horizontal_scale() {
        const currentWidth = heatMapSection.clientWidth;
        
        // 1. Apply transform to heatmap cells (includes zoom and pan)
        // Mini heatmaps inherit this transform automatically as children of cellsG
        const transform = `translate(${-PAN_MAIN}, 0) scale(${ZOOM_MAIN}, 1)`;
        cellsG.attr('transform', transform);
        
        // 2. Apply same transform to x-labels (when axes are swapped)
        const xLabelsGroup = d3.select('.x-labels-group');
        if (!xLabelsGroup.empty()) {
            const labelTransform = `translate(${-PAN_MAIN * (xLabelWidthOnInit / currentWidth)}, 0) scale(${ZOOM_MAIN}, 1)`;
            xLabelsGroup.attr('transform', labelTransform);
            
            // Reformat text in x-label boxes to flow naturally based on zoom level
            xLabelsGroup.selectAll('.x-label-text').each(function(_, i) {
                const cellSizes = X_CATEGORY === 'place' ? PLACE_CELL_SIZES : (X_CATEGORY === 'time' ? TIME_CELL_SIZES : null);
                const newWidth = currentWidth / columnCount * ZOOM_MAIN * (cellSizes ? cellSizes[i] : 1);
                const el = d3.select(this);
                const cellHeight = parseFloat(el.attr('data-cell-height'));
                // Reformat text wrapping based on zoomed width
                if (typeof formatXLabelText === 'function') {
                    formatXLabelText(el, newWidth, cellHeight);
                }
                el.attr('transform', `scale(${1 / ZOOM_MAIN * (xLabelWidthOnInit / currentWidth)}, 1)`);
            });
        }
        
        // 3. Update timeline scale and transform
        if (timelineScale && timelineG && timelineAxis) {
            // Update scale range to match zoomed width
            timelineScale.range([0, currentWidth * ZOOM_MAIN]);
            
            // Adjust tick interval based on zoom level (only for date timelines)
            if (!AXES_SWAPPED && timelineDates) {
                timelineAxis.ticks(timeTickInterval(ZOOM_MAIN, timelineScale.minDate, timelineScale.maxDate));
            }
            
            // Apply pan transform to timeline
            timelineG.attr('transform', `translate(${-PAN_MAIN}, 0)`);
            timelineG.call(timelineAxis);
            
            // Reapply styling to newly generated elements after axis redraw
            timelineG.selectAll('text')
                .style('font-size', '11px')
                .style('fill', 'var(--primary-light)');
            timelineG.selectAll('line, path')
                .style('stroke', 'var(--primary-light)');
        }
        
        // 3b. Update coordinate scale if axes are swapped and place category is lat/lng
        if (AXES_SWAPPED && (PLACE_CATEGORY === 'latitude' || PLACE_CATEGORY === 'longitude')) {
            const coordScale = window.mainCoordScaleData;
            if (coordScale && coordScale.scale && coordScale.axis && coordScale.g) {
                // Update scale range to match zoomed width
                coordScale.scale.range([0, currentWidth * ZOOM_MAIN]);
                
                // Adjust tick interval based on zoom level
                let tickInterval;
                if (ZOOM_MAIN < 2) {
                    tickInterval = 8;
                } else if (ZOOM_MAIN < 4) {
                    tickInterval = 16;
                } else if (ZOOM_MAIN < 8) {
                    tickInterval = 32;
                } else {
                    tickInterval = 64;
                }
                coordScale.axis.ticks(tickInterval);
                
                // Apply pan transform to coordinate scale
                coordScale.g.attr('transform', `translate(${-PAN_MAIN}, 0)`);
                coordScale.g.call(coordScale.axis);
                
                // Reapply styling to newly generated elements after axis redraw
                coordScale.g.selectAll('text')
                    .style('font-size', '11px')
                    .style('fill', 'var(--primary-light)');
                coordScale.g.selectAll('line, path')
                    .style('stroke', 'var(--primary-light)');
            }
        }
        
        // 4. Update line graphs
        updateLineGraphs(lineGraphSection, currentWidth);

        // 4. Update highlight box position and size
        if (window.updateHighlightPosition && highlightCell && highlightCell.style.display !== 'none') {
            window.updateHighlightPosition();
        }
    }

    /**
     * Handle horizontal zoom with mousewheel
     */
    function handleZoom(event) {
        event.preventDefault();
        
        const heatmapRect = mainHeatmapSVG.node().getBoundingClientRect();
        const mouseX = event.clientX - heatmapRect.left;
        
        const zoomDelta = event.deltaY > 0 ? (1 / SPECS.zoomSpeed) : SPECS.zoomSpeed;
        const newZoomScale = Math.max(1, Math.min(SPECS.maxZoom, ZOOM_MAIN * zoomDelta));
        if (newZoomScale === ZOOM_MAIN) return;
        
        // Calculate focal point in unzoomed coordinates
        const focalPointX = (mouseX + PAN_MAIN) / ZOOM_MAIN;
        
        // Calculate new pan offset to keep focal point under cursor
        PAN_MAIN = focalPointX * newZoomScale - mouseX;
        
        // Clamp pan offset
        const maxPan = heatMapSection.clientWidth * newZoomScale - heatMapSection.clientWidth;
        PAN_MAIN = Math.max(0, Math.min(maxPan, PAN_MAIN));
        
        ZOOM_MAIN = newZoomScale;
        
        // Apply all updates through unified function
        update_horizontal_scale();
    }

    /**
     * Handle horizontal resize of heatmap section
     */
    function handleHeatmapResize(newWidth, newHeight, newCellWidth) {
        // When width changes while zoomed, scale PAN_OFFSET proportionally to keep visual position
        if (newWidth !== previousHeatmapWidth && ZOOM_MAIN > 1) {
            const widthRatio = newWidth / previousHeatmapWidth;
            PAN_MAIN *= widthRatio;
            
            // Clamp the new PAN_OFFSET to valid range
            const maxPan = newWidth * ZOOM_MAIN - newWidth;
            PAN_MAIN = Math.max(0, Math.min(maxPan, PAN_MAIN));
        }
        
        previousHeatmapWidth = newWidth;
        
        // Update viewBox to match new container dimensions
        mainHeatmapSVG.attr('viewBox', `0 0 ${newWidth} ${newHeight}`);
        
        // Update all main heatmap cell x and width attributes, accounting for PLACE_CELL_SIZES and TIME_CELL_SIZES
        rowGroups.selectAll('rect').each(function(d, i) {
            const cellSizes = X_CATEGORY === 'place' ? PLACE_CELL_SIZES : (X_CATEGORY === 'time' ? TIME_CELL_SIZES : null);
            const customCellWidth = newCellWidth * (cellSizes && (columnCount > 1) ? (cellSizes[i] || 1) : 1);
            let accWidth = 0;
            // Calculate accumulated x position for this cell
            for (let j = 0; j < i; j++) {
                accWidth += newCellWidth * (cellSizes && (columnCount > 1) ? (cellSizes[j] || 1) : 1);
            }
            d3.select(this)
                .attr('x', accWidth)
                .attr('width', customCellWidth);
        });
        
        // Update x-label-text width and reformat text
        const xLabelsGroup = d3.select('.x-labels-group');
        if (!xLabelsGroup.empty()) {
            xLabelsGroup.selectAll('.x-label-text').each(function(_, i) {
                const el = d3.select(this);
                const cellHeight = parseFloat(el.attr('data-cell-height'));
                // Update data attribute and reformat text for new width
                el.attr('data-cell-width', newCellWidth);
                if (typeof formatXLabelText === 'function') {
                    formatXLabelText(el, newCellWidth, cellHeight);
                }
                // Keep text centered
                el.attr('x', newCellWidth / 2)
                  .attr('y', cellHeight / 2);
            });
        }
        
        // Update mini heatmap cells in expanded rows if any exist
        rowGroups.selectAll('g.mini').each(function() {
            const miniG = d3.select(this);
            const miniRects = miniG.selectAll('rect:not([pointer-events="none"])');
            
            if (!miniRects.empty()) {
                // Find the dimensions of the mini grid
                let maxCol = 0;
                miniRects.each(function() {
                    const d = d3.select(this).datum();
                    if (d && d.col > maxCol) maxCol = d.col;
                });
                const cols = maxCol + 1;
                const miniCellW = newWidth / cols;
                
                // Update mini cell positions and widths, accounting for PLACE_CELL_SIZES and TIME_CELL_SIZES
                miniRects.each(function() {
                    const d = d3.select(this).datum();
                    if (d) {
                        const miniCellSizes = X_CATEGORY === 'place' ? PLACE_CELL_SIZES : (X_CATEGORY === 'time' ? TIME_CELL_SIZES : null);
                        const customCellWidth = miniCellW * (miniCellSizes && (cols > 1) ? (miniCellSizes[d.col] || 1) : 1);
                        let accWidth = 0;
                        // Calculate accumulated x position for this cell
                        for (let j = 0; j < d.col; j++) {
                            accWidth += miniCellW * (miniCellSizes && (cols > 1) ? (miniCellSizes[j] || 1) : 1);
                        }
                        d3.select(this)
                            .attr('x', accWidth)
                            .attr('width', customCellWidth);
                    }
                });
                
                // Update border rect if it exists
                miniG.select('rect[pointer-events="none"]').each(function() {
                    let borderWidth = 0;
                    const miniCellSizes = X_CATEGORY === 'place' ? PLACE_CELL_SIZES : (X_CATEGORY === 'time' ? TIME_CELL_SIZES : null);
                    // Calculate total width accounting for PLACE_CELL_SIZES and TIME_CELL_SIZES
                    for (let c = 0; c < cols; c++) {
                        borderWidth += miniCellW * (miniCellSizes && (cols > 1) ? (miniCellSizes[c] || 1) : 1);
                    }
                    borderWidth = Math.max(0, borderWidth - 1);
                    d3.select(this)
                        .attr('width', borderWidth);
                });
            }
        });
        
        // Update coordinate scale SVG width if axes are swapped and place category is lat/lng
        if (AXES_SWAPPED && (PLACE_CATEGORY === 'latitude' || PLACE_CATEGORY === 'longitude')) {
            const coordScale = window.mainCoordScaleData;
            if (coordScale && coordScale.svg) {
                d3.select(coordScale.svg).attr('width', newWidth * ZOOM_MAIN);
            }
        }
        
        // Apply all zoom/pan updates through unified function
        update_horizontal_scale();
    }

    /**
     * Handle horizontal drag panning (only x component)
     */
    function handlePanMouseDown(e) {
        // Only start panning if cursor is over heatmap, x-labels, or linegraph
        const target = e.target;
        const heatmapContainer = mainHeatmapSVG.node().parentElement;
        
        if (!heatmapContainer.contains(target) && !xLabelSection.contains(target) && !lineGraphSection.contains(target)) {
            return;
        }
        
        // Don't pan if already dragging vertical resize
        if (isDraggingXLabel || isDraggingLineGraph) {
            return;
        }
        
        isPanning = true;
        panStartX = e.clientX;
        panStartOffset = PAN_MAIN;
        document.body.style.userSelect = 'none';
    }

    /**
     * Handle horizontal panning during mouse move
     */
    function handlePanMouseMove(e) {
        if (!isPanning) return;
        
        const deltaX = e.clientX - panStartX;
        const heatmapWidth = heatMapSection.clientWidth;
        const maxPan = heatmapWidth * ZOOM_MAIN - heatmapWidth;
        
        // Calculate new pan offset
        const newPanOffset = Math.max(0, Math.min(maxPan, panStartOffset - deltaX));
        
        // Only update if changed
        if (newPanOffset !== PAN_MAIN) {
            PAN_MAIN = newPanOffset;
            update_horizontal_scale();
        }
    }

    /**
     * Handle panning end
     */
    function handlePanMouseUp() {
        if (isPanning) {
            isPanning = false;
            document.body.style.userSelect = '';
        }
    }

    /**
     * Calculate new heights for vertical resizing
     */
    function calculateVerticalResize(isDraggingXLabel, deltaY) {
        const chartHeight = chartContainer.clientHeight;
        const sliderHeight = sliderSection.clientHeight;
        const xLabelHeight = xLabelSection.clientHeight;
        
        let newHeatmapHeight, newLineGraphHeight;
        
        if (isDraggingXLabel) {
            newHeatmapHeight = heatMapSection.clientHeight + deltaY;
            if (newHeatmapHeight <= 50) return null;
            newLineGraphHeight = chartHeight - sliderHeight - newHeatmapHeight - xLabelHeight;
        } else {
            newLineGraphHeight = Math.max(50, lineGraphSection.clientHeight - deltaY);
            newHeatmapHeight = chartHeight - sliderHeight - xLabelHeight - newLineGraphHeight;
        }
        
        return (newHeatmapHeight >= 50 && newLineGraphHeight >= 50) 
            ? { newHeatmapHeight, newLineGraphHeight } 
            : null;
    }
    
    /**
     * Apply vertical layout changes (heights and positions)
     */
    function updateVerticalLayout(newHeatmapHeight, newLineGraphHeight) {
        const sliderHeight = sliderSection.clientHeight;
        const xLabelHeight = xLabelSection.clientHeight;
        const yLabelSection = document.getElementById('y-Label-section');
        
        heatMapSection.style.height = `${newHeatmapHeight}px`;
        yLabelSection.style.height = `${newHeatmapHeight}px`;
        lineGraphSection.style.height = `${newLineGraphHeight}px`;
        chartContainer.style.gridTemplateRows = `${sliderHeight}px ${newHeatmapHeight}px ${xLabelHeight}px ${newLineGraphHeight}px`;
        applyActiveTopicsLayout(false);
        
        // Store heights for reinitialization
        localStorage.setItem('LINEGRAPH_HEIGHT', newLineGraphHeight);
    }

    /**
     * Unified vertical resize handler for both x-label and linegraph sections
     */
    function handleVerticalResize(isDraggingXLabel, currentY, startY) {
        const deltaY = currentY - startY;
        const sizes = calculateVerticalResize(isDraggingXLabel, deltaY);
        if (sizes) {
            updateVerticalLayout(sizes.newHeatmapHeight, sizes.newLineGraphHeight);
        }
        return currentY;
    }

    /**
     * Handle vertical drag resizing for x-label-section
     */
    function handleDragMove(e) {
        if (isDraggingXLabel) {
            startYXLabel = handleVerticalResize(true, e.clientY, startYXLabel);
        }
        if (isDraggingLineGraph) {
            startYLineGraph = handleVerticalResize(false, e.clientY, startYLineGraph);
        }
    }

    function handleDragUp() {
        isDraggingXLabel = false;
        isDraggingLineGraph = false;
        document.body.style.userSelect = '';
    }

    function handleXLabelMouseDown(e) {
        isDraggingXLabel = true;
        startYXLabel = e.clientY;
        document.body.style.userSelect = 'none';
    }

    function addEventListener(element, event, handler, options = {}) {
        element.addEventListener(event, handler, options);
        element[`_${event}Handler`] = handler;
    }

    /**
     * Unified event listener removal
     */
    function removeEventListener(element, event) {
        if (!element) return; // Safety check for null elements
        const handler = element[`_${event}Handler`];
        if (handler) {
            element.removeEventListener(event, handler);
            element[`_${event}Handler`] = null;
        }
    }

    /**
     * Set up all event listeners and observers
     */
    function setupEventListeners() {
        // Guard against undefined elements
        if (!mainHeatmapSVG || !mainHeatmapSVG.node() || !heatMapSection || !xLabelSection || !lineGraphSection) {
            return;
        }
        
        const heatmapContainer = mainHeatmapSVG.node().parentElement;
        
        // Zoom wheel listeners
        addEventListener(heatmapContainer, 'wheel', handleZoom, {passive: false});
        addEventListener(xLabelSection, 'wheel', handleZoom, {passive: false});
        addEventListener(lineGraphSection, 'wheel', handleZoom, {passive: false});
        heatMapSection._wheelHandler = handleZoom;
        
        // Heatmap resize observer
        const heatmapResizeObserver = new ResizeObserver(() => {
            const newWidth = heatMapSection.clientWidth;
            const newHeight = heatMapSection.clientHeight;
            const newCellWidth = newWidth / columnCount;
            handleHeatmapResize(newWidth, newHeight, newCellWidth);
        });
        heatmapResizeObserver.observe(heatMapSection);
        heatMapSection._resizeObserver = heatmapResizeObserver;
        
        // Panning listeners
        addEventListener(heatmapContainer, 'mousedown', handlePanMouseDown);
        addEventListener(lineGraphSection, 'mousedown', handlePanMouseDown);
        addEventListener(document, 'mousemove', handlePanMouseMove);
        addEventListener(document, 'mouseup', handlePanMouseUp);
        
        // Vertical resizing listeners
        xLabelSection.style.cursor = 'ns-resize';
        addEventListener(xLabelSection, 'mousedown', handleXLabelMouseDown);
        addEventListener(document, 'mousemove', handleDragMove);
        addEventListener(document, 'mouseup', handleDragUp);
    }

    /**
     * Clean up event listeners (called before re-initialization)
     */
    function cleanup() {
        const heatmapContainer = mainHeatmapSVG.node().parentElement;
        
        // Remove wheel handlers
        if (heatMapSection._wheelHandler) {
            if (heatmapContainer) removeEventListener(heatmapContainer, 'wheel');
            if (xLabelSection) removeEventListener(xLabelSection, 'wheel');
            if (lineGraphSection) removeEventListener(lineGraphSection, 'wheel');
            heatMapSection._wheelHandler = null;
        }
        
        // Disconnect resize observer
        if (heatMapSection._resizeObserver) {
            heatMapSection._resizeObserver.disconnect();
            heatMapSection._resizeObserver = null;
        }
        
        // Remove all other event listeners using unified removal
        if (heatmapContainer) removeEventListener(heatmapContainer, 'mousedown');
        if (xLabelSection) removeEventListener(xLabelSection, 'mousedown');
        if (lineGraphSection) removeEventListener(lineGraphSection, 'mousedown');
        removeEventListener(document, 'mousemove');
        removeEventListener(document, 'mouseup');
    }

    // Setup on initialization
    setupEventListeners();

    // Return public API
    return {
        cleanup,
        getZoomScale: () => ZOOM_MAIN,
        getPanOffset: () => PAN_MAIN,
        setZoomScale: (scale) => {
            ZOOM_MAIN = scale;
        },
        setPanOffset: (offset) => {
            PAN_MAIN = offset;
        },
        updateHorizontalScale: update_horizontal_scale,
        updateVerticalLayout
    };
}
