/**
 * Detail View Movement Handler
 * Handles zoom and pan independently for detail view heatmaps
 * Uses separate ZOOM_DETAIL_X/Y and PAN_DETAIL_X/Y variables to avoid interfering with main view
 */

function initializeDetailMovement() {
    // Horizontal (X-axis) pan state variables
    let detailPanningX = false;
    let detailPanStartX = 0;
    let detailPanStartOffsetX = 0;
    
    // Vertical (Y-axis) pan state variables
    let detailPanningY = false;
    let detailPanStartY = 0;
    let detailPanStartOffsetY = 0;
    
    // Track dimensions for pan offset scaling on resize
    let previousDetailWidth = null;
    let previousDetailHeight = null;
    
    /**
     * Apply combined X and Y zoom and pan transforms to all heatmaps
     * Uses single matrix transform to prevent overwriting
     */
    function applyDetailTransforms() {
        const topLeftCell = document.querySelector('.detail-cell-top-left');
        const topRightCell = document.querySelector('.detail-cell-top-right');
        const bottomRightCell = document.querySelector('.detail-cell-bottom-right');
        
        if (!topLeftCell || !topRightCell || !bottomRightCell) return;
        
        // Get all heatmap SVGs
        const topLeftHeatmapSVG = topLeftCell.querySelector('svg');
        const topRightHeatmapSVG = topRightCell.querySelector('svg');
        const bottomRightHeatmapSVG = bottomRightCell.querySelector('svg:not(.labels-svg)');
        
        // Single matrix combining X zoom, Y zoom, X pan, Y pan
        const combinedTransform = `matrix(${ZOOM_DETAIL_X}, 0, 0, ${ZOOM_DETAIL_Y}, ${-PAN_DETAIL_X}, ${-PAN_DETAIL_Y})`;
        
        // Apply to top-left (affected by Y zoom/pan only)
        if (topLeftHeatmapSVG) {
            topLeftHeatmapSVG.style.transform = `matrix(1, 0, 0, ${ZOOM_DETAIL_Y}, 0, ${-PAN_DETAIL_Y})`;
            topLeftHeatmapSVG.style.transformOrigin = '0 0';
        }
        
        // Apply to top-right (affected by both X and Y zoom/pan)
        if (topRightHeatmapSVG) {
            topRightHeatmapSVG.style.transform = combinedTransform;
            topRightHeatmapSVG.style.transformOrigin = '0 0';
        }
        
        // Apply to bottom-right (affected by X zoom/pan only)
        if (bottomRightHeatmapSVG) {
            bottomRightHeatmapSVG.style.transform = `matrix(${ZOOM_DETAIL_X}, 0, 0, 1, ${-PAN_DETAIL_X}, 0)`;
            bottomRightHeatmapSVG.style.transformOrigin = '0 0';
        }
        
        // Update all labels and timelines
        updateDetailLabels();
        updateDetailHighlightBox();
    }
    
    /**
     * Update all detail view labels and timelines based on current zoom/pan
     */
    function updateDetailLabels() {
        const topLeftCell = document.querySelector('.detail-cell-top-left');
        const topRightCell = document.querySelector('.detail-cell-top-right');
        const bottomRightCell = document.querySelector('.detail-cell-bottom-right');
        
        // Update horizontal timeline in bottom-right
        const detailTimeline = window.detailTimelineData;
        const coordScale = window.detailCoordScaleData;
        if (X_CATEGORY === 'time' && detailTimeline && detailTimeline.scale && detailTimeline.axis && detailTimeline.g) {
            const cellWidth = topRightCell.getBoundingClientRect().width;
            const zoomedWidth = cellWidth * ZOOM_DETAIL_X;
            
            if (detailTimeline.svg) {
                d3.select(detailTimeline.svg).attr('width', zoomedWidth);
            }
            
            detailTimeline.scale.range([0, zoomedWidth]);
            
            detailTimeline.axis.ticks(timeTickInterval(ZOOM_DETAIL_X, detailTimeline.minDate, detailTimeline.maxDate));
            
            detailTimeline.g.attr('transform', `translate(${-PAN_DETAIL_X}, 0)`);
            detailTimeline.g.call(detailTimeline.axis);
            
            detailTimeline.g.selectAll('text')
                .style('font-size', '11px')
                .style('fill', 'var(--primary-light)');
            detailTimeline.g.selectAll('line, path')
                .style('stroke', 'var(--primary-light)');
        }

        //Update horizontal coordScale in bottom-right
        if (X_CATEGORY === 'place' && coordScale && coordScale.scale && coordScale.axis && coordScale.g) {
            const cellWidth = topRightCell.getBoundingClientRect().width;
            const zoomedWidth = cellWidth * ZOOM_DETAIL_X;
            
            if (coordScale.svg) {
                d3.select(coordScale.svg).attr('width', zoomedWidth);
            }
            
            coordScale.scale.range([0, zoomedWidth]);
            
            let tickInterval;
            if (ZOOM_DETAIL_X < 2) {
                tickInterval = 8;
            } else if (ZOOM_DETAIL_X < 4) {
                tickInterval = 16;
            } else if (ZOOM_DETAIL_X < 8) {
                tickInterval = 32;
            } else {
                tickInterval = 64;
            }
            coordScale.axis.ticks(tickInterval);
            
            coordScale.g.attr('transform', `translate(${-PAN_DETAIL_X}, 0)`);
            coordScale.g.call(coordScale.axis);
            
            coordScale.g.selectAll('text')
                .style('font-size', '11px')
                .style('fill', 'var(--primary-light)');
            coordScale.g.selectAll('line, path')
                .style('stroke', 'var(--primary-light)');
        }
        
        // Update horizontal label boxes in bottom-right
        const xLabelsGroup = d3.select('#detail-x-labels-group');
        if (!xLabelsGroup.empty() && isFinite(ZOOM_DETAIL_X) && isFinite(PAN_DETAIL_X)) {
            const cellWidth = topRightCell.getBoundingClientRect().width;
            const columnCount = xLabelsGroup.selectAll('.x-label-box').size();
            
            const panOffset = -PAN_DETAIL_X * (cellWidth / topRightCell.clientWidth);
            if (isFinite(panOffset)) {
                const labelTransform = `translate(${panOffset}, 0) scale(${ZOOM_DETAIL_X}, 1)`;
                xLabelsGroup.attr('transform', labelTransform);
                
                xLabelsGroup.selectAll('.x-label-text').each((d, i, nodes) => {
                    const el = d3.select(nodes[i]);
                    const newCellWidth = cellWidth / columnCount * ZOOM_DETAIL_X * (X_CATEGORY == 'place' ? PLACE_CELL_SIZES[i] : 1);
                    const cellHeight = parseFloat(el.attr('data-cell-height'));
                    formatXLabelText(el, newCellWidth, cellHeight);
                    el.attr('transform', `scale(${1 / ZOOM_DETAIL_X}, 1)`);
                });
            }
        }
        
        // Update vertical timeline in top-left
        const detailVerticalTimeline = window.detailVerticalTimelineData;
        if (Y_CATEGORY === 'time' && detailVerticalTimeline && detailVerticalTimeline.scale && detailVerticalTimeline.axis && detailVerticalTimeline.g) {
            const cellHeight = topRightCell.getBoundingClientRect().height;
            const zoomedHeight = cellHeight * ZOOM_DETAIL_Y;
            
            if (detailVerticalTimeline.svg) {
                d3.select(detailVerticalTimeline.svg).attr('height', zoomedHeight);
            }
            
            detailVerticalTimeline.scale.range([zoomedHeight, 0]); // Inverted for vertical

            detailVerticalTimeline.axis.ticks(timeTickInterval(ZOOM_DETAIL_Y, detailVerticalTimeline.minDate, detailVerticalTimeline.maxDate));
            
            // Include the stored timelineX offset in the transform
            const timelineX = detailVerticalTimeline.timelineX || 0;
            detailVerticalTimeline.g.attr('transform', `translate(${timelineX}, ${-PAN_DETAIL_Y})`);
            detailVerticalTimeline.g.call(detailVerticalTimeline.axis);
            
            detailVerticalTimeline.g.selectAll('text')
                .style('font-size', '11px')
                .style('fill', 'var(--primary-light)');
            detailVerticalTimeline.g.selectAll('line, path')
                .style('stroke', 'var(--primary-light)');
        }

        // Update vertical coordScale in top-left
        const detailVerticalCoordScale = window.detailVerticalCoordScaleData;
        if (Y_CATEGORY === 'place' && detailVerticalCoordScale && detailVerticalCoordScale.scale && detailVerticalCoordScale.axis && detailVerticalCoordScale.g) {
            const cellHeight = topRightCell.getBoundingClientRect().height;
            const zoomedHeight = cellHeight * ZOOM_DETAIL_Y;
            
            if (detailVerticalCoordScale.svg) {
                d3.select(detailVerticalCoordScale.svg).attr('height', zoomedHeight);
            }
            
            detailVerticalCoordScale.scale.range([zoomedHeight, 0]); // Inverted for vertical
            
            let tickInterval;
            if (ZOOM_DETAIL_Y < 2) {
                tickInterval = 8;
            } else if (ZOOM_DETAIL_Y < 4) {
                tickInterval = 16;
            } else if (ZOOM_DETAIL_Y < 8) {
                tickInterval = 32;
            } else {
                tickInterval = 64;
            }
            detailVerticalCoordScale.axis.ticks(tickInterval);
            
            // Include the stored timelineX offset in the transform
            const timelineX = detailVerticalCoordScale.timelineX || 0;
            detailVerticalCoordScale.g.attr('transform', `translate(${timelineX}, ${-PAN_DETAIL_Y})`);
            detailVerticalCoordScale.g.call(detailVerticalCoordScale.axis);
            
            detailVerticalCoordScale.g.selectAll('text')
                .style('font-size', '11px')
                .style('fill', 'var(--primary-light)');
            detailVerticalCoordScale.g.selectAll('line, path')
                .style('stroke', 'var(--primary-light)');
        }
        
        // Update vertical place labels in top-left
        if (Y_CATEGORY === 'place') {
            // Find the label container (direct child of cellElement, with zIndex 5)
            const labelContainers = topLeftCell.querySelectorAll('div[style*="z-index: 5"]');
            const labelContainer = labelContainers.length > 0 ? labelContainers[0] : null;
            
            if (labelContainer && isFinite(ZOOM_DETAIL_Y) && isFinite(PAN_DETAIL_Y)) {
                const cellHeight = topRightCell.getBoundingClientRect().height;
                const labels = labelContainer.querySelectorAll('div[style*="position: absolute"][style*="left: 5px"]');
                const totalLabels = labels.length;
                
                const panOffset = -PAN_DETAIL_Y * (cellHeight / topRightCell.clientHeight);
                
                if (isFinite(panOffset)) {
                    // Apply pan offset and scaleY to move/resize container with zoomed cells
                    labelContainer.style.transform = `translate(0, ${panOffset}px) scaleY(${ZOOM_DETAIL_Y})`;
                    labelContainer.style.transformOrigin = '0 0';
                    
                    // Apply inverse scaleY to each label to prevent text from stretching
                    labels.forEach((label, idx) => {
                        label.style.transform = `scaleY(${1 / ZOOM_DETAIL_Y})`;
                        label.style.transformOrigin = '0 0';
                        
                        // Update font size based on zoomed cell height
                        // Each label's height is customCellHeight, which changes with zoom
                        const customCellHeight = (cellHeight / totalLabels) * (Y_CATEGORY === 'place' && totalLabels > 1 ? (PLACE_CELL_SIZES[idx] || 1) : 1);
                        const zoomedCellHeight = customCellHeight * ZOOM_DETAIL_Y;
                        const fontSize = Math.max(9, Math.min(zoomedCellHeight * 0.4, 14));
                        label.style.fontSize = fontSize + 'px';
                        label.style.height = zoomedCellHeight + 'px';
                    });
                }
            }
        }
    }
    
    /**
     * Update the detail heatmap highlight box position based on current zoom/pan
     * Uses same calculation method as mousemove handler
     * Accounts for variable cell sizes when X_CATEGORY or Y_CATEGORY is 'place'
     */
    function updateDetailHighlightBox() {
        const highlightBox = highlightCell;
        if (!highlightBox || highlightBox.style.display === 'none') return;
        const topRightCell = document.querySelector('.detail-cell-top-right');
        if (!topRightCell) return;
        const mainHeatmapSVG = topRightCell.querySelector('svg');
        if (!mainHeatmapSVG) return;
        // Get stored dimensions and last mouse position
        const colCount = mainHeatmapSVG._colCount;
        const rowCount = mainHeatmapSVG._rowCount;
        const lastMouseX = mainHeatmapSVG._lastMouseX;
        const lastMouseY = mainHeatmapSVG._lastMouseY;
        
        if (!colCount || !rowCount || lastMouseX === null || lastMouseY === null) return;
        
        // Get current rect (includes transform)
        const svgRect = mainHeatmapSVG.getBoundingClientRect();
        
        // Convert screen coordinates to position relative to SVG
        const mouseX = lastMouseX - svgRect.left;
        const mouseY = lastMouseY - svgRect.top;
        
        let col = 0;
        let cellWidth = svgRect.width / colCount;
        let screenLeft = svgRect.left;
        const baseCellWidth = svgRect.width / colCount;

        const customWidths = X_CATEGORY === 'place' ? PLACE_CELL_SIZES : TIME_CELL_SIZES;

        let accumulatedWidth = 0;
        for (let i = 0; i < colCount; i++) {
            const cellW = baseCellWidth * (customWidths[i] || 1);
            if (mouseX < accumulatedWidth + cellW) {
                col = i;
                cellWidth = cellW;
                screenLeft = svgRect.left + accumulatedWidth;
                break;
            }
            accumulatedWidth += cellW;
        }
        // If not found in loop, clamp to last column
        if (col >= colCount - 1) {
            col = colCount - 1;
        }
        
        let row = 0;
        let cellHeight = svgRect.height / rowCount;
        let screenTop = svgRect.top;
        const baseCellHeight = svgRect.height / rowCount;

        const customHeights = Y_CATEGORY === 'place' ? PLACE_CELL_SIZES : TIME_CELL_SIZES;

        let accumulatedHeight = 0;
        for (let i = 0; i < rowCount; i++) {
            const cellH = baseCellHeight * (customHeights[i] || 1);
            if (mouseY < accumulatedHeight + cellH) {
                row = i;
                cellHeight = cellH;
                screenTop = svgRect.top + accumulatedHeight;
                break;
            }
            accumulatedHeight += cellH;
        }
        // If not found in loop, clamp to last row
        if (row >= rowCount - 1) {
            row = rowCount - 1;
        }
        
        // Update highlight box
        highlightBox.style.left = Math.round(screenLeft) + 'px';
        highlightBox.style.top = Math.round(screenTop) + 'px';
        highlightBox.style.width = Math.round(cellWidth) + 'px';
        highlightBox.style.height = Math.round(cellHeight) + 'px';
    }

    /**
     * Handle horizontal (X-axis) zoom with mousewheel for detail view
     * Zoom where the cursor hovers (focal point zoom)
     */
    function handleDetailZoomX(event) {
        event.preventDefault();
        
        // Only zoom in top-right and bottom-right cells
        let container = null;
        let heatmapRect = null;
        
        const topRightCell = document.querySelector('.detail-cell-top-right');
        const bottomRightCell = document.querySelector('.detail-cell-bottom-right');
        
        if (topRightCell && topRightCell.contains(event.target)) {
            container = topRightCell;
            heatmapRect = topRightCell.getBoundingClientRect();
        } else if (bottomRightCell && bottomRightCell.contains(event.target)) {
            container = bottomRightCell;
            heatmapRect = bottomRightCell.getBoundingClientRect();
        }
        
        if (!container || !heatmapRect || heatmapRect.width <= 0) return;
        
        const mouseX = event.clientX - heatmapRect.left;
        const zoomDelta = event.deltaY > 0 ? (1 / SPECS.zoomSpeed) : SPECS.zoomSpeed;
        const newZoomScale = Math.max(1, Math.min(SPECS.maxZoom, ZOOM_DETAIL_X * zoomDelta));
        
        if (newZoomScale === ZOOM_DETAIL_X) return;
        
        const focalPointX = (mouseX + PAN_DETAIL_X) / ZOOM_DETAIL_X;
        PAN_DETAIL_X = focalPointX * newZoomScale - mouseX;
        
        const maxPan = heatmapRect.width * newZoomScale - heatmapRect.width;
        PAN_DETAIL_X = Math.max(0, Math.min(maxPan, PAN_DETAIL_X));
        
        ZOOM_DETAIL_X = newZoomScale;
        applyDetailTransforms();
    }
    
    /**
     * Handle vertical (Y-axis) zoom with mousewheel for detail view
     * Triggered in top-left cell, or in top-right cell when Ctrl is pressed
     */
    function handleDetailZoomY(event) {
        event.preventDefault();
        
        const topLeftCell = document.querySelector('.detail-cell-top-left');
        const topRightCell = document.querySelector('.detail-cell-top-right');
        
        // Allow zoom in top-left OR top-right with Ctrl
        const isTopLeft = topLeftCell && topLeftCell.contains(event.target);
        const isTopRightWithCtrl = topRightCell && topRightCell.contains(event.target) && event.ctrlKey;
        
        if (!isTopLeft && !isTopRightWithCtrl) return;
        
        const heatmapRect = (isTopLeft ? topLeftCell : topRightCell).getBoundingClientRect();
        if (heatmapRect.height <= 0) return;
        
        const mouseY = event.clientY - heatmapRect.top;
        const zoomDelta = event.deltaY > 0 ? (1 / SPECS.zoomSpeed) : SPECS.zoomSpeed;
        const newZoomScale = Math.max(1, Math.min(SPECS.maxZoom, ZOOM_DETAIL_Y * zoomDelta));
        
        if (newZoomScale === ZOOM_DETAIL_Y) return;
        
        const focalPointY = (mouseY + PAN_DETAIL_Y) / ZOOM_DETAIL_Y;
        PAN_DETAIL_Y = focalPointY * newZoomScale - mouseY;
        
        const maxPan = heatmapRect.height * newZoomScale - heatmapRect.height;
        PAN_DETAIL_Y = Math.max(0, Math.min(maxPan, PAN_DETAIL_Y));
        
        ZOOM_DETAIL_Y = newZoomScale;
        applyDetailTransforms();
    }
    
    /**
     * Unified zoom handler that triggers independent X and Y based on which cell is hovered
     * In top-right cell: Ctrl = vertical zoom, no Ctrl = horizontal zoom
     */
    function handleDetailZoom(event) {
        const topLeftCell = document.querySelector('.detail-cell-top-left');
        const topRightCell = document.querySelector('.detail-cell-top-right');
        const bottomRightCell = document.querySelector('.detail-cell-bottom-right');
        
        // Vertical zooming: ONLY in top-left cell
        if (topLeftCell && topLeftCell.contains(event.target)) {
            handleDetailZoomY(event);
        }
        // Top-right cell: zoom direction depends on Ctrl key
        else if (topRightCell && topRightCell.contains(event.target)) {
            if (event.ctrlKey) {
                handleDetailZoomY(event);
            } else {
                handleDetailZoomX(event);
            }
        }
        // Bottom-right cell: horizontal zooming only
        else if (bottomRightCell && bottomRightCell.contains(event.target)) {
            handleDetailZoomX(event);
        }
    }
        
    /**
     * Handle mouse down for panning - start tracking
     * Different behaviors depending on which cell was clicked
     */
    function handleDetailPanMouseDown(event) {
        if (event.button !== 0) return;
        if (event.target.classList.contains('highlight-box')) return;
        
        const topLeftCell = document.querySelector('.detail-cell-top-left');
        const topRightCell = document.querySelector('.detail-cell-top-right');
        const bottomRightCell = document.querySelector('.detail-cell-bottom-right');
        
        // Top-left: pan only Y axis
        if (topLeftCell && topLeftCell.contains(event.target)) {
            detailPanningY = true;
            detailPanStartY = event.clientY;
            detailPanStartOffsetY = PAN_DETAIL_Y;
            document.body.style.userSelect = 'none';
            event.preventDefault();
            return;
        }
        
        // Top-right: pan both X and Y axes
        if (topRightCell && topRightCell.contains(event.target)) {
            detailPanningX = true;
            detailPanningY = true;
            detailPanStartX = event.clientX;
            detailPanStartY = event.clientY;
            detailPanStartOffsetX = PAN_DETAIL_X;
            detailPanStartOffsetY = PAN_DETAIL_Y;
            document.body.style.userSelect = 'none';
            event.preventDefault();
            return;
        }
        
        // Bottom-right: pan only X axis
        if (bottomRightCell && bottomRightCell.contains(event.target)) {
            detailPanningX = true;
            detailPanStartX = event.clientX;
            detailPanStartOffsetX = PAN_DETAIL_X;
            document.body.style.userSelect = 'none';
            event.preventDefault();
            return;
        }
    }
    
    /**
     * Handle mouse move for panning - update pan offsets
     * Handles both X and Y panning based on which cells are involved
     */
    function handleDetailPanMouseMove(event) {
        const topLeftCell = document.querySelector('.detail-cell-top-left');
        const topRightCell = document.querySelector('.detail-cell-top-right');
        const bottomRightCell = document.querySelector('.detail-cell-bottom-right');
        
        // Handle Y panning (from top-left or top-right)
        if (detailPanningY) {
            const cellRef = topLeftCell || topRightCell;
            if (!cellRef) return;
            
            const deltaY = event.clientY - detailPanStartY;
            const cellHeight = cellRef.getBoundingClientRect().height;
            const maxPan = cellHeight * ZOOM_DETAIL_Y - cellHeight;
            
            const newPan = Math.max(0, Math.min(maxPan, detailPanStartOffsetY - deltaY));
            PAN_DETAIL_Y = newPan;
        }
        
        // Handle X panning (from top-right or bottom-right)
        if (detailPanningX) {
            const cellRef = topRightCell || bottomRightCell;
            if (!cellRef) return;
            
            const deltaX = event.clientX - detailPanStartX;
            const cellWidth = cellRef.getBoundingClientRect().width;
            const maxPan = cellWidth * ZOOM_DETAIL_X - cellWidth;
            
            const newPan = Math.max(0, Math.min(maxPan, detailPanStartOffsetX - deltaX));
            PAN_DETAIL_X = newPan;
        }

        if(detailPanningX || detailPanningY) {
            applyDetailTransforms();
        }
    }
    
    /**
     * Handle mouse up for panning - stop tracking
     */
    function handleDetailPanMouseUp(event) {
        if (detailPanningX || detailPanningY) {
            detailPanningX = false;
            detailPanningY = false;
            document.body.style.userSelect = '';
        }
    }

    /**
     * Setup zoom event listeners on detail cells
     */
    function setupDetailZoomListeners() {
        const topLeftCell = document.querySelector('.detail-cell-top-left');
        const topRightCell = document.querySelector('.detail-cell-top-right');
        const bottomRightCell = document.querySelector('.detail-cell-bottom-right');
        
        if (topLeftCell) {
            topLeftCell.addEventListener('wheel', handleDetailZoom, { passive: false });
            topLeftCell.addEventListener('mousedown', handleDetailPanMouseDown);
            topLeftCell.addEventListener('mouseenter', () => {
                updateLegendValues('detail_vertical');
            });
            topLeftCell.addEventListener('mouseleave', () => {
                updateLegendValues('detail_main');
            });
        }
        
        if (topRightCell) {
            topRightCell.addEventListener('wheel', handleDetailZoom, { passive: false });
            topRightCell.addEventListener('mousedown', handleDetailPanMouseDown);
            topRightCell.addEventListener('mouseenter', () => {
                updateLegendValues('detail_main');
            });
        }
        
        if (bottomRightCell) {
            bottomRightCell.addEventListener('wheel', handleDetailZoom, { passive: false });
            bottomRightCell.addEventListener('mousedown', handleDetailPanMouseDown);
            bottomRightCell.addEventListener('mouseenter', () => {
                updateLegendValues('detail_horizontal');
            });
            bottomRightCell.addEventListener('mouseleave', () => {
                updateLegendValues('detail_main');
            });
        }
        
        document.addEventListener('mousemove', handleDetailPanMouseMove);
        document.addEventListener('mouseup', handleDetailPanMouseUp);
    }

    /**
     * Setup resize observer to maintain zoom/pan on detail cells resize
     */
    function setupDetailResizeObserver() {
        const topLeftCell = document.querySelector('.detail-cell-top-left');
        const topRightCell = document.querySelector('.detail-cell-top-right');
        const bottomRightCell = document.querySelector('.detail-cell-bottom-right');
        
        if (topLeftCell) {
            const observer = new ResizeObserver(() => {
                const newHeight = topLeftCell.getBoundingClientRect().height;
                
                // Scale vertical pan offset on height change (for vertical zoom only)
                if (previousDetailHeight !== null && newHeight !== previousDetailHeight && ZOOM_DETAIL_Y > 1) {
                    const heightRatio = newHeight / previousDetailHeight;
                    PAN_DETAIL_Y *= heightRatio;
                    const maxPan = newHeight * ZOOM_DETAIL_Y - newHeight;
                    PAN_DETAIL_Y = Math.max(0, Math.min(maxPan, PAN_DETAIL_Y));
                }
                
                previousDetailHeight = newHeight;
                applyDetailTransforms();
            });
            observer.observe(topLeftCell);
            topLeftCell._detailResizeObserver = observer;
        }
        
        if (topRightCell) {
            const observer = new ResizeObserver(() => {
                const newWidth = topRightCell.getBoundingClientRect().width;
                const newHeight = topRightCell.getBoundingClientRect().height;
                
                // Scale horizontal pan offset on width change
                if (previousDetailWidth !== null && newWidth !== previousDetailWidth && ZOOM_DETAIL_X > 1) {
                    const widthRatio = newWidth / previousDetailWidth;
                    PAN_DETAIL_X *= widthRatio;
                    const maxPan = newWidth * ZOOM_DETAIL_X - newWidth;
                    PAN_DETAIL_X = Math.max(0, Math.min(maxPan, PAN_DETAIL_X));
                }
                
                // Scale vertical pan offset on height change
                if (previousDetailHeight !== null && newHeight !== previousDetailHeight && ZOOM_DETAIL_Y > 1) {
                    const heightRatio = newHeight / previousDetailHeight;
                    PAN_DETAIL_Y *= heightRatio;
                    const maxPan = newHeight * ZOOM_DETAIL_Y - newHeight;
                    PAN_DETAIL_Y = Math.max(0, Math.min(maxPan, PAN_DETAIL_Y));
                }
                
                previousDetailWidth = newWidth;
                previousDetailHeight = newHeight;
                applyDetailTransforms();
            });
            observer.observe(topRightCell);
            topRightCell._detailResizeObserver = observer;
        }
        
        if (bottomRightCell) {
            const observer = new ResizeObserver(() => {
                const newWidth = bottomRightCell.getBoundingClientRect().width;
                
                // Only handle horizontal resizing for bottom-right cell
                if (previousDetailWidth !== null && newWidth !== previousDetailWidth && ZOOM_DETAIL_X > 1) {
                    const widthRatio = newWidth / previousDetailWidth;
                    PAN_DETAIL_X *= widthRatio;
                    const maxPan = newWidth * ZOOM_DETAIL_X - newWidth;
                    PAN_DETAIL_X = Math.max(0, Math.min(maxPan, PAN_DETAIL_X));
                }
                
                previousDetailWidth = newWidth;
                applyDetailTransforms();
            });
            observer.observe(bottomRightCell);
            bottomRightCell._detailResizeObserver = observer;
        }
    }

    /**
     * Cleanup detail movement event listeners and observers
     */
    function cleanupDetailMovement() {
        const topLeftCell = document.querySelector('.detail-cell-top-left');
        const topRightCell = document.querySelector('.detail-cell-top-right');
        const bottomRightCell = document.querySelector('.detail-cell-bottom-right');
        
        if (topLeftCell) {
            topLeftCell.removeEventListener('wheel', handleDetailZoom);
            topLeftCell.removeEventListener('mousedown', handleDetailPanMouseDown);
            if (topLeftCell._detailResizeObserver) {
                topLeftCell._detailResizeObserver.disconnect();
                topLeftCell._detailResizeObserver = null;
            }
        }
        
        if (topRightCell) {
            topRightCell.removeEventListener('wheel', handleDetailZoom);
            topRightCell.removeEventListener('mousedown', handleDetailPanMouseDown);
            if (topRightCell._detailResizeObserver) {
                topRightCell._detailResizeObserver.disconnect();
                topRightCell._detailResizeObserver = null;
            }
        }
        
        if (bottomRightCell) {
            bottomRightCell.removeEventListener('wheel', handleDetailZoom);
            bottomRightCell.removeEventListener('mousedown', handleDetailPanMouseDown);
            if (bottomRightCell._detailResizeObserver) {
                bottomRightCell._detailResizeObserver.disconnect();
                bottomRightCell._detailResizeObserver = null;
            }
        }
        
        document.removeEventListener('mousemove', handleDetailPanMouseMove);
        document.removeEventListener('mouseup', handleDetailPanMouseUp);
        
        // Reset zoom/pan to defaults
        ZOOM_DETAIL_X = 1;
        PAN_DETAIL_X = 0;
        ZOOM_DETAIL_Y = 1;
        PAN_DETAIL_Y = 0;
    }

    /**
     * Initialize detail movement when detail view loads
     */
    function init() {
        setupDetailZoomListeners();
        setupDetailResizeObserver();
    }

    // Return public API
    return {
        init,
        cleanup: cleanupDetailMovement,
        getZoomScaleX: () => ZOOM_DETAIL_X,
        getPanOffsetX: () => PAN_DETAIL_X,
        getZoomScaleY: () => ZOOM_DETAIL_Y,
        getPanOffsetY: () => PAN_DETAIL_Y,
        setZoomScaleX: (scale) => {
            ZOOM_DETAIL_X = scale;
            applyDetailTransforms();
        },
        setPanOffsetX: (offset) => {
            PAN_DETAIL_X = offset;
            applyDetailTransforms();
        },
        setZoomScaleY: (scale) => {
            ZOOM_DETAIL_Y = scale;
            applyDetailTransforms();
        },
        setPanOffsetY: (offset) => {
            PAN_DETAIL_Y = offset;
            applyDetailTransforms();
        }
    };
}

// Create global detail movement handler
let detailMovementHandler = null;

function initializeDetailMovementHandler() {
    if (detailMovementHandler !== null) return; // Already initialized
    detailMovementHandler = initializeDetailMovement();
}
