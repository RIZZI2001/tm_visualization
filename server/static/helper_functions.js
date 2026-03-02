// Loader for frontend specifications (stored as JSON under server/static/frontend-specs.json)
async function loadDatasets() {
    try{
        const resp = await fetch('/data_sets', {cache: 'no-store'});
        if(resp.ok) return await resp.json();
    }catch(e){}
    return [];
}

async function loadFrontendSpecs(){
    try{
        const resp = await fetch('./frontend-specs.json', {cache: 'no-store'});
        if(resp.ok) return await resp.json();
    }catch(e){}
    return {};
}

async function loadTopicNames(){
    try{
        const resp = await fetch('./topic-names.json', {cache: 'no-store'});
        if(resp.ok) {
            const allNames = await resp.json();
            return allNames[SPECS.dataSet] || {};
        }
    }catch(e){}
    return {};
}

async function loadTaxonomyLevels(){
    try{
        const resp = await fetch(`/taxonomy_levels?dataSet=${SPECS.dataSet}`, {cache: 'no-store'});
        if(resp.ok) {
            const data = await resp.json();
            return [data.dict || {}, data.levels || []];
        }
    }catch(e){}
    return [{}, []];
}

function generateGroupedOTUValues(dataItems) {
    let root = TAXONOMY_DICT;
    let path = [];
    while(Object.keys(root).length === 1) {
        path.push(Object.keys(root)[0]);
        root = root[Object.keys(root)[0]];
    }

    let newDataItems = [['Unnamed: 0', '-2']];

    Object.keys(root).forEach(level1 => {
        const leafNodes = generateOTUList([...path, level1]);
        let totalValue = 0;

        leafNodes.forEach(leaf => {
            const item = dataItems.find(row => row[0] === leaf);
            const value = item ? parseFloat(item[1]) : null;
            if (value !== null) {
                totalValue += value;
            }
        });
        const avgValue = totalValue / leafNodes.length;
        newDataItems.push([level1, avgValue]);
    });

    return newDataItems;
}

function generateOTUList(taxonomy) {
    let current = TAXONOMY_DICT;
    
    for (let i = 0; i < taxonomy.length; i++) {
        const key = taxonomy[i];
        if (current[key]) {
            current = current[key];
        } else {
            return []; // Return empty if path not found
        }
    }
    
    const leafNodes = [];
    function collectLeaves(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return;
        }
        
        const keys = Object.keys(obj);
        // If object has no children, it's a leaf node
        if (keys.length === 0) {
            return;
        }

        const hasObjectChildren = keys.some(key => typeof obj[key] === 'object' && obj[key] !== null && Object.keys(obj[key]).length > 0);
        if (!hasObjectChildren) {
            leafNodes.push(...keys);
        } else {
            keys.forEach(key => {
                if (typeof obj[key] === 'object' && obj[key] !== null && Object.keys(obj[key]).length > 0) {
                    collectLeaves(obj[key]);
                }
            });
        }
    }
    
    // Check if current object itself is a leaf (has no children)
    if (Object.keys(current).length === 0) {
        // Return the last taxonomy key as it's the leaf node
        leafNodes.push(taxonomy[taxonomy.length - 1]);
    } else {
        collectLeaves(current);
    }
    return leafNodes;
}

async function loadAllDates(){
    try{
        const payload = {
            "file": `Input/${SPECS.dataSet}/metadata.csv`,
            "data_set": `${SPECS.dataSet}`,
            "table_type": "metadata",
            "specs": {
                "sample": generateSampleSpec("place", true),
                "attribute": {
                    "type": "single",
                    "value": ["date"]
                }
            }
        };
        const resp = await fetchCSVData(payload);
        const rows = parseAndValidateCSV(resp.csv).splice(1).map(r => r[0]);
        for( let i = 0; i < rows.length; i++ ) {
            rows[i] = formatDate(rows[i]);
        }
        return rows;
    }catch(e){}
    return [];
}

// ============================================================================
// CSV Parsing Utilities
// ============================================================================

/**
 * Parse CSV text and validate basic structure
 * @param {string} csvText - Raw CSV text
 * @param {number} minRows - Minimum expected rows (default: 2)
 * @param {number} minCols - Minimum expected columns (default: 2)
 * @returns {Array|null} Parsed rows or null if invalid
 */
function parseAndValidateCSV(csvText, minRows = 2, minCols = 2) {
    const txt = String(csvText || '').trim();
    if (!txt) return null;
    if (txt.startsWith('Error')) return null;
    
    const rows = d3.csvParseRows(txt);
    if (!rows || rows.length < minRows) return null;
    if (minCols > 0 && rows[0].length < minCols) return null;
    return rows;
}

/**
 * Parse date labels into Date objects
 * @param {Array<string>} labels - Array of date strings
 * @returns {Array<Date>} Array of Date objects (invalid dates filtered out)
 */
function parseDateLabels(labels) {
    return labels.map(label => {
        const d = new Date(label);
        return isNaN(d.getTime()) ? null : d;
    }).filter(d => d !== null);
}

/**
 * Format date as day-month-year
 * @param {string} dateString - Date string to format
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
    const parsedDate = new Date(dateString);
    if (isNaN(parsedDate.getTime())) return dateString;
    
    const day = String(parsedDate.getDate()).padStart(2, '0');
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const year = parsedDate.getFullYear();
    return `${day}-${month}-${year}`;
}

// ============================================================================
// Coordinate and Transform Utilities
// ============================================================================

function screenToContainerCoords(screenX, screenY, containerRect) {
    return {
        x: screenX - containerRect.left,
        y: screenY - containerRect.top
    };
}

function transpose(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0) return [];
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
}

// ============================================================================
// DOM Element Creation Utilities
// ============================================================================

/**
 * Create a positioned div container
 * @param {string} id - Element ID
 * @param {Object} styles - Style properties
 * @returns {HTMLDivElement}
 */
function createContainer(id, styles = {}) {
    const container = document.createElement('div');
    container.id = id;
    
    const defaultStyles = {
        position: 'absolute',
        pointerEvents: 'none',
        display: 'none',
        zIndex: '10000'
    };
    
    Object.assign(container.style, defaultStyles, styles);
    return container;
}

/**
 * Create a vertical ruler line
 * @param {string} id - Element ID
 * @returns {HTMLDivElement}
 */
function createRulerLine(id) {
    return createContainer(id, {
        width: '1px',
        backgroundColor: 'white',
        zIndex: '10000'
    });
}

/**
 * Create a data point indicator dot
 * @param {number} x - X position (center)
 * @param {number} y - Y position (center)
 * @param {string} color - Dot color
 * @returns {HTMLDivElement}
 */
function createDataDot(x, y) {
    const dot = document.createElement('div');
    dot.style.position = 'absolute';
    dot.style.left = (x - 4) + 'px';
    dot.style.top = (y - 4) + 'px';
    dot.style.width = '8px';
    dot.style.height = '8px';
    dot.style.backgroundColor = 'var(--accent)';
    dot.style.borderRadius = '50%';
    dot.style.border = '1px solid white';
    return dot;
}

/**
 * Create a value readout element
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {string} text - Readout text
 * @param {boolean} alignRight - Align to the right of x position
 * @returns {HTMLDivElement}
 */
function createReadout(x, y, text, nearRightEdge = false) {
    const readout = document.createElement('div');
    readout.style.position = 'absolute';
    readout.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    readout.style.color = 'white';
    readout.style.padding = '4px 8px';
    readout.style.borderRadius = '4px';
    readout.style.fontSize = '12px';
    readout.style.whiteSpace = 'nowrap';
    readout.style.border = '1px solid white';
    readout.style.top = (y - 10) + 'px';
    readout.style.visibility = 'hidden';  // Hidden until positioned
    readout.textContent = text;
    
    // Add to body temporarily to measure width
    document.body.appendChild(readout);
    
    // Measure and position synchronously (no flicker)
    const readoutWidth = readout.offsetWidth;
    
    const leftPos = nearRightEdge 
        ? (x - readoutWidth - 5) + 'px'
        : (x + 5) + 'px';
    
    readout.style.left = leftPos;
    readout.style.visibility = 'visible';  // Show once positioned
    
    // Remove from body (caller will re-append to appropriate container)
    document.body.removeChild(readout);
    
    return readout;
}

// Get or create global tooltip (lazy initialization to avoid blocking LCP)
function getHeatmapTooltip() {
    let tooltip = d3.select('body').select('.heatmap-tooltip');
    if (tooltip.empty()) {
        tooltip = d3.select('body').append('div')
            .attr('class', 'heatmap-tooltip');
    }
    return tooltip;
}

function parseAndRenderHeatmap(csvData, cellElement, kind) {
    const rows = parseAndValidateCSV(csvData);

    let rowLabels = rows[0].slice(1);
    let colLabels = rows.slice(1).map(r => r[0]);

    if(kind === 'main') {setActiveDates(colLabels);}

    const values = [];
    
    // Parse data: convert string values to floats, skip first column (labels)
    let matrix = rows.slice(1).map(row => 
        row.slice(1).map(v => {
            const parsed = parseFloat(v);
            if (!isNaN(parsed)) values.push(parsed);
            return parsed;
        })
    );

    const vmin = values.length ? Math.min(...values) : 0;
    const vmax = values.length ? Math.max(...values) : 1;
    const colorScale = createColorScale(vmin, vmax);

    if (AXES_SWAPPED && kind === 'main' || kind === 'vertical') {
        matrix = transpose(matrix);
        [rowLabels, colLabels] = [colLabels, rowLabels];
    }
    const colCount = matrix.length;
    const rowCount = matrix[0].length;

    const containerWidth = cellElement.clientWidth;
    const containerHeight = cellElement.clientHeight;
    const cellWidth = containerWidth / colCount;
    const cellHeight = containerHeight / rowCount;

    // Create SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${colCount * cellWidth} ${rowCount * cellHeight}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.display = 'block';

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(g);
    let colorsArray = [];

    let accHeight = 0;
    let accWidth = 0;

    const miniYCellSizes = Y_CATEGORY === 'place' ? PLACE_CELL_SIZES : TIME_CELL_SIZES;
    const miniXCellSizes = X_CATEGORY === 'place' ? PLACE_CELL_SIZES : TIME_CELL_SIZES;

    for (let rr = 0; rr < rowCount; rr++) {
        const customCellHeight = cellHeight * (kind !== 'horizontal' ? (miniYCellSizes[rr] || 1) : 1);
        accHeight += customCellHeight;
        for (let cc = 0; cc < colCount; cc++) {
            const customCellWidth = cellWidth * (kind !== 'vertical' ? (miniXCellSizes[cc] || 1) : 1);
            accWidth += customCellWidth;
            const val = matrix[cc][rr];
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', accWidth - customCellWidth);
            rect.setAttribute('y', accHeight - customCellHeight);
            rect.setAttribute('width', customCellWidth);
            rect.setAttribute('height', customCellHeight);
            rect.setAttribute('fill', !isNaN(val) ? colorScale(val) : '#707070ff');
            rect.setAttribute('stroke', 'none');
            g.appendChild(rect);
            //Collect colors for label colors
            if(kind !== 'main') colorsArray.push(!isNaN(val) ? colorScale(val) : '#707070ff');
        }
        accWidth = 0;
    }

    cellElement.appendChild(svg);
    
    // Store grid dimensions and reference on SVG for zoom calculations
    svg._colCount = colCount;
    svg._rowCount = rowCount;
    svg._lastMouseX = null;
    svg._lastMouseY = null;
    
    // Add hover tracking for 2D heatmap
    let detailHoveredCell = null;
    if (kind === 'main') {
        
        // Add mouse move listener for hover highlighting
        svg.addEventListener('mousemove', (event) => {
            // Store current mouse position for detail zoom calculations
            svg._lastMouseX = event.clientX;
            svg._lastMouseY = event.clientY;
            
            const svgRect = svg.getBoundingClientRect();
            const mouseX = event.clientX - svgRect.left;
            const mouseY = event.clientY - svgRect.top;
            
            // Check if primary mouse button is down AND either zoom is active
            const isPrimaryButtonDown = (event.buttons & 1) === 1;
            const isZoomedIn = ZOOM_DETAIL_X > 1 || ZOOM_DETAIL_Y > 1;
            const shouldHideReadout = isPrimaryButtonDown && isZoomedIn;
            
            // Calculate column with consideration for cell sizes if applicable
            let col = 0;
            let cellWidth = svgRect.width / colCount;
            let screenLeft = svgRect.left;
            const baseCellWidth = svgRect.width / colCount;
            
            // Determine which size array to use based on X_CATEGORY
            const xcellSizes = X_CATEGORY === 'time' ? TIME_CELL_SIZES : PLACE_CELL_SIZES;
            
            if (xcellSizes && xcellSizes.length > 0) {
                let accumulatedWidth = 0;
                for (let i = 0; i < colCount; i++) {
                    const cellW = baseCellWidth * (xcellSizes[i] || 1);
                    if (mouseX < accumulatedWidth + cellW) {
                        col = i;
                        cellWidth = cellW;
                        screenLeft = svgRect.left + accumulatedWidth;
                        break;
                    }
                    accumulatedWidth += cellW;
                }
                if (col >= colCount - 1) {
                    col = colCount - 1;
                }
            } else {
                col = Math.floor((mouseX / svgRect.width) * colCount);
                col = Math.max(0, Math.min(colCount - 1, col));
                screenLeft = svgRect.left + col * cellWidth;
            }
            
            // Calculate row with consideration for cell sizes if applicable
            let row = 0;
            let cellHeight = svgRect.height / rowCount;
            let screenTop = svgRect.top;
            const baseCellHeight = svgRect.height / rowCount;
            
            // Determine which size array to use based on Y_CATEGORY
            const ycellSizes = Y_CATEGORY === 'time' ? TIME_CELL_SIZES : PLACE_CELL_SIZES;
            
            if (ycellSizes && ycellSizes.length > 0) {
                let accumulatedHeight = 0;
                for (let i = 0; i < rowCount; i++) {
                    const cellH = baseCellHeight * (ycellSizes[i] || 1);
                    if (mouseY < accumulatedHeight + cellH) {
                        row = i;
                        cellHeight = cellH;
                        screenTop = svgRect.top + accumulatedHeight;
                        break;
                    }
                    accumulatedHeight += cellH;
                }
                if (row >= rowCount - 1) {
                    row = rowCount - 1;
                }
            } else {
                row = Math.floor((mouseY / svgRect.height) * rowCount);
                row = Math.max(0, Math.min(rowCount - 1, row));
                screenTop = svgRect.top + row * cellHeight;
            }
            
            if (col >= 0 && col < colCount && row >= 0 && row < rowCount && !shouldHideReadout) {
                const val = matrix[col][row];
                const cellKey = `${row}-${col}`;
                
                if (detailHoveredCell !== cellKey) {
                    detailHoveredCell = cellKey;
                    
                    highlightCell.style.left = Math.round(screenLeft) + 'px';
                    highlightCell.style.top = Math.round(screenTop) + 'px';
                    highlightCell.style.width = Math.round(cellWidth) + 'px';
                    highlightCell.style.height = Math.round(cellHeight) + 'px';
                    highlightCell.style.display = 'block';
                    
                    // Show tooltip with row label, col label, and value
                    const tooltip = getHeatmapTooltip();
                    const valueStr = !isNaN(val) ? val.toFixed(3) : 'N/A';
                    
                    let rowLabel = rowLabels[row] || 'Unknown';
                    let colLabel = colLabels[col] || 'Unknown';

                    let timeLabel = colLabel;
                    let placeLabel = rowLabel;
                    
                    if (AXES_SWAPPED) {
                        [timeLabel, placeLabel] = [rowLabel, colLabel];
                    }
                    timeLabel = formatDate(timeLabel);
                    placeLabel = SPECS.showPlaceNameLabels 
                        ? (SITE_NAMES[parseInt(placeLabel.replace('s', '')) - 1] || placeLabel)
                        : placeLabel;

                    tooltip.html(`<strong>Time:</strong> ${timeLabel}<br><strong>Place:</strong> ${placeLabel}<br><strong>Value:</strong> ${valueStr}`).style('display', 'block');
                    
                    // Position tooltip in screen coordinates
                    const tooltipWidth = tooltip.node().offsetWidth;
                    const nearRightEdge = (screenLeft + cellWidth) + tooltipWidth + 5 > window.innerWidth * 0.95;
                    const leftPos = nearRightEdge 
                        ? (screenLeft - tooltipWidth - 5) + 'px'
                        : (screenLeft + cellWidth + 5) + 'px';
                    
                    tooltip.style('left', leftPos)
                        .style('top', (screenTop + cellHeight / 2 - tooltip.node().offsetHeight / 2) + 'px');
                }
            } else if (shouldHideReadout) {
                // Hide readout when button is down and zoomed in
                detailHoveredCell = null;
                getHeatmapTooltip().style('display', 'none');
            }
        });
        
        svg.addEventListener('mouseleave', () => {
            detailHoveredCell = null;
            highlightCell.style.display = 'none';
            getHeatmapTooltip().style('display', 'none');
        });
    } else if (kind === 'vertical' || kind === 'horizontal') {
        // Add hover functionality for 1D heatmaps
        let hoveredIndex = null;
        
        svg.addEventListener('mousemove', (event) => {
            const svgRect = svg.getBoundingClientRect();
            
            if (kind === 'vertical') {
                // For vertical heatmap: show Y axis label (place or time) and value
                const mouseY = event.clientY - svgRect.top;
                const baseCellHeight = svgRect.height / rowCount;
                let row = 0;
                let cellHeight = baseCellHeight;
                let screenTop = svgRect.top;
                
                // Determine which size array to use based on Y_CATEGORY
                const ycellSizes = Y_CATEGORY === 'time' ? TIME_CELL_SIZES : PLACE_CELL_SIZES;
                
                if (ycellSizes && ycellSizes.length > 0) {
                    let accumulatedHeight = 0;
                    for (let i = 0; i < rowCount; i++) {
                        const cellH = baseCellHeight * (ycellSizes[i] || 1);
                        if (mouseY < accumulatedHeight + cellH) {
                            row = i;
                            cellHeight = cellH;
                            screenTop = svgRect.top + accumulatedHeight;
                            break;
                        }
                        accumulatedHeight += cellH;
                    }
                    if (row >= rowCount - 1) {
                        row = rowCount - 1;
                    }
                } else {
                    row = Math.floor((mouseY / svgRect.height) * rowCount);
                    row = Math.max(0, Math.min(rowCount - 1, row));
                    screenTop = svgRect.top + (row * svgRect.height / rowCount);
                }
                
                if (hoveredIndex !== row) {
                    hoveredIndex = row;
                    const val = matrix[0][row]; // Get value from first column
                    const label = rowLabels[row] || 'Unknown';
                    const valueStr = !isNaN(val) ? val.toFixed(3) : 'N/A';
                    
                    // Determine label text and category based on label format
                    let displayLabel = label;
                    let categoryName = 'Value';
                    
                    if (Y_CATEGORY === 'place') {
                        categoryName = 'Place';
                        if (SPECS.showPlaceNameLabels) {
                            displayLabel = SITE_NAMES[parseInt(label.replace('s', '')) - 1] || label;
                        }
                    } else {
                        categoryName = 'Time';
                        displayLabel = formatDate(label);
                    }
                    highlightCell.style.left = Math.round(svgRect.left) + 'px';
                    highlightCell.style.top = Math.round(screenTop) + 'px';
                    highlightCell.style.width = Math.round(svgRect.width) + 'px';
                    highlightCell.style.height = Math.round(cellHeight) + 'px';
                    highlightCell.style.display = 'block';
                    
                    const tooltip = getHeatmapTooltip();
                    tooltip.html(`<strong>${categoryName}:</strong> ${displayLabel}<br><strong>${categoryName == 'Time' ? 'Place' : 'Time'}:</strong> averaged<br><strong>Value:</strong> ${valueStr}`).style('display', 'block');
                    
                    const tooltipWidth = tooltip.node().offsetWidth;
                    const nearRightEdge = svgRect.right + tooltipWidth + 5 > window.innerWidth * 0.95;
                    const leftPos = nearRightEdge 
                        ? (svgRect.left - tooltipWidth - 5) + 'px'
                        : (svgRect.right + 5) + 'px';
                    
                    tooltip.style('left', leftPos)
                        .style('top', (screenTop + cellHeight / 2 - tooltip.node().offsetHeight / 2) + 'px');
                }
            } else if (kind === 'horizontal') {
                // For horizontal heatmap: show X axis label (time or place) and value
                const mouseX = event.clientX - svgRect.left;
                const baseCellWidth = svgRect.width / colCount;
                let col = 0;
                let cellWidth = baseCellWidth;
                let screenLeft = svgRect.left;
                
                // Determine which size array to use based on X_CATEGORY
                const xcellSizes = X_CATEGORY === 'time' ? TIME_CELL_SIZES : PLACE_CELL_SIZES;
                
                if (xcellSizes && xcellSizes.length > 0) {
                    let accumulatedWidth = 0;
                    for (let i = 0; i < colCount; i++) {
                        const cellW = baseCellWidth * (xcellSizes[i] || 1);
                        if (mouseX < accumulatedWidth + cellW) {
                            col = i;
                            cellWidth = cellW;
                            screenLeft = svgRect.left + accumulatedWidth;
                            break;
                        }
                        accumulatedWidth += cellW;
                    }
                    if (col >= colCount - 1) {
                        col = colCount - 1;
                    }
                } else {
                    col = Math.floor((mouseX / svgRect.width) * colCount);
                    col = Math.max(0, Math.min(colCount - 1, col));
                    screenLeft = svgRect.left + (col * svgRect.width / colCount);
                }
                
                if (hoveredIndex !== col) {
                    hoveredIndex = col;
                    const val = matrix[col][0]; // Get value from first row
                    const label = colLabels[col] || 'Unknown';
                    const valueStr = !isNaN(val) ? val.toFixed(3) : 'N/A';
                    
                    // Determine label text and category based on label format
                    let displayLabel = label;
                    let categoryName = 'Value';
                    
                    if (X_CATEGORY === 'place') {
                        categoryName = 'Place';
                        if (SPECS.showPlaceNameLabels) {
                            displayLabel = SITE_NAMES[parseInt(label.replace('s', '')) - 1] || label;
                        }
                    } else {
                        categoryName = 'Time';
                        displayLabel = formatDate(label);
                    }
                    
                    highlightCell.style.left = Math.round(screenLeft) + 'px';
                    highlightCell.style.top = Math.round(svgRect.top) + 'px';
                    highlightCell.style.width = Math.round(cellWidth) + 'px';
                    highlightCell.style.height = Math.round(svgRect.height) + 'px';
                    highlightCell.style.display = 'block';
                    
                    const tooltip = getHeatmapTooltip();
                    tooltip.html(`<strong>${categoryName}:</strong> ${displayLabel}<br><strong>${categoryName == 'Time' ? 'Place' : 'Time'}:</strong> averaged<br><strong>Value:</strong> ${valueStr}`).style('display', 'block');
                    
                    const tooltipWidth = tooltip.node().offsetWidth;
                    const nearRightEdge = (screenLeft + cellWidth) + tooltipWidth + 5 > window.innerWidth * 0.95;
                    const leftPos = nearRightEdge 
                        ? (screenLeft - tooltipWidth - 5) + 'px'
                        : (screenLeft + cellWidth + 5) + 'px';
                    
                    tooltip.style('left', leftPos)
                        .style('top', (svgRect.top + svgRect.height / 2 - tooltip.node().offsetHeight / 2) + 'px');
                }
            }
        });
        
        svg.addEventListener('mouseleave', () => {
            hoveredIndex = null;
            highlightCell.style.display = 'none';
            getHeatmapTooltip().style('display', 'none');
        });
    }
    
    if(kind !== 'main') {
        return {labels: (rowCount > colCount ? rowLabels : colLabels), colors: colorsArray, svg: svg, valueRange: {min: vmin, max: vmax}};
    }
    
    // For 'main' kind, also return the svg element
    return {labels: rowLabels, colors: colorsArray, svg: svg, valueRange: {min: vmin, max: vmax}};
}

// ============================================================================
// Data Processing Utilities
// ============================================================================

/**
 * Find min and max values in a numeric array, ignoring NaN
 * @param {Array<number>} values - Array of numeric values
 * @returns {{min: number, max: number}}
 */
function getValueRange(values) {
    const validValues = values.filter(v => !isNaN(v));
    return {
        min: validValues.length ? Math.min(...validValues) : 0,
        max: validValues.length ? Math.max(...validValues) : 1
    };
}

function setPlaceSpacingAndOrder(forceSite = false) {
    const category = PLACE_CATEGORY || SPECS.defaultPlaceCategory || 'site';
    
    // Step 1: Sort ACTIVE_SITES based on category
    if(category == 'site' || forceSite) {
        ACTIVE_SITES.sort((a, b) => {
            if( SPECS.customSiteOrder && SPECS.customSiteOrder.length >= ACTIVE_SITES.length ) {
                const aValue = SPECS.customSiteOrder.indexOf(a.toString());
                const bValue = SPECS.customSiteOrder.indexOf(b.toString());
                return (PLACE_INVERTED && !forceSite) ? bValue - aValue : aValue - bValue;
            } else {
                return (PLACE_INVERTED && !forceSite) ? b - a : a - b;
            }
        });
    } else {
        ACTIVE_SITES.sort((a, b) => {
            const aValue = SITE_COORDS[a - 1]?.[category] ?? 0;
            const bValue = SITE_COORDS[b - 1]?.[category] ?? 0;
            return PLACE_INVERTED ? bValue - aValue : aValue - bValue;
        });
    }
    if(forceSite) return;

    PLACE_CELL_SIZES = new Array(ACTIVE_SITES.length);

    if(!SPECS.scaleCellsByDistance) {
        PLACE_SPACINGS = [0.5];
        for(let i = 0; i < ACTIVE_SITES.length; i++) {
            PLACE_CELL_SIZES[i] = 1;
            if(i > 0){
                PLACE_SPACINGS.push(1);
            }
        }
        PLACE_SPACINGS.push(0.5);
        return;
    }

    const n = ACTIVE_SITES.length;
    if (n === 1) {
        PLACE_CELL_SIZES = [1];
        PLACE_SPACINGS = [0.5, 0.5];
        return;
    }
    
    const rawSpacings = [];
    // Middle spacings: distances between consecutive points
    for (let i = 0; i < n - 1; i++) {
        let distance;
        if(category === 'site') {
            const long1 = (SITE_COORDS[ACTIVE_SITES[i] - 1]?.['longitude']);
            const long2 = (SITE_COORDS[ACTIVE_SITES[i + 1] - 1]?.['longitude']);
            const lat1 = (SITE_COORDS[ACTIVE_SITES[i] - 1]?.['latitude']);
            const lat2 = (SITE_COORDS[ACTIVE_SITES[i + 1] - 1]?.['latitude']);

            const long = Math.abs(long2 - long1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180)); // Adjust for latitude
            const lat = Math.abs(lat2 - lat1);

            distance = Math.sqrt(long * long + lat * lat);
        } else {
            distance = Math.abs((SITE_COORDS[ACTIVE_SITES[i + 1] - 1]?.[category]) - (SITE_COORDS[ACTIVE_SITES[i] - 1]?.[category]));
        }
        rawSpacings.push(distance);
    }
    const avgDistance = rawSpacings.reduce((a, b) => a + b, 0) / rawSpacings.length;
    rawSpacings.unshift(avgDistance / 2);
    rawSpacings.push(avgDistance / 2);
    
    const totalSpacing = avgDistance * n;
    PLACE_SPACINGS = rawSpacings.map(spacing => (spacing / totalSpacing) * n);
    PLACE_SPACINGS_SUM = PLACE_SPACINGS.reduce((a, b) => a + b, 0);

    PLACE_CELL_SIZES = new Array(n);
    for (let i = 0; i < n; i++) {
        // Cell i is flanked by spacing i and spacing i+1
        let leftSpacing = PLACE_SPACINGS[i] / 2;
        if(i === 0) leftSpacing = PLACE_SPACINGS[0]; // First cell gets full first spacing
        let rightSpacing = PLACE_SPACINGS[i + 1] / 2;
        if(i === n - 1) rightSpacing = PLACE_SPACINGS[n]; // Last cell gets full last spacing
        PLACE_CELL_SIZES[i] = leftSpacing + rightSpacing;
    }
}

function setActiveDates(days, formatted = false) {
    ACTIVE_DATES = [];
    if(formatted) {
        ACTIVE_DATES = [...days];
    } else {
        for (let i = 0; i < days.length; i++) {
            ACTIVE_DATES.push(formatDate(days[i]) );
        }
    }
    setTimeSpacing();
}

function setTimeSpacing() {
    // Helper function to convert DD-MM-YYYY string to Date object
    function dateStringToDate(dateStr) {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return null;
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        return new Date(year, month - 1, day);
    }

    let activeDatesTrimmed = [];
    if(CURRENT_VIEW === 'main' && AXES_SWAPPED) {
        const minDate = dateStringToDate(MIN_DATE);
        const maxDate = dateStringToDate(MAX_DATE);
        activeDatesTrimmed = ACTIVE_DATES.filter(d => {
            const dateObj = dateStringToDate(d);
            return dateObj && dateObj >= minDate && dateObj <= maxDate;
        });
    } else {
        activeDatesTrimmed = [...ACTIVE_DATES];
    }
    

    //Convert all to Date objects and filter out invalid dates
    for(let i = 0; i < activeDatesTrimmed.length; i++) {
        const dateObj = dateStringToDate(activeDatesTrimmed[i]);
        activeDatesTrimmed[i] = dateObj;
    }

    const n = activeDatesTrimmed.length;
    if (n === 0) {
        TIME_CELL_SIZES = [];
        TIME_SPACINGS = [];
        return;
    }
    
    if (n === 1) {
        TIME_CELL_SIZES = [1];
        TIME_SPACINGS = [0.5, 0.5];
        return;
    }
    const rawSpacings = [];
    
    for (let i = 0; i < n - 1; i++) {
        const distance = Math.abs(activeDatesTrimmed[i + 1] - activeDatesTrimmed[i]) / (1000 * 60 * 60 * 24);
        rawSpacings.push(distance);
    }
    
    const avgDistance = rawSpacings.reduce((a, b) => a + b, 0) / rawSpacings.length;
    rawSpacings.unshift(avgDistance / 2);
    rawSpacings.push(avgDistance / 2);
    
    // Normalize spacings so sum equals number of dates
    const totalSpacing = rawSpacings.reduce((a, b) => a + b, 0);
    TIME_SPACINGS = rawSpacings.map(spacing => totalSpacing > 0 ? (spacing / totalSpacing) * n : spacing);

    TIME_SPACINGS_SUM = TIME_SPACINGS.reduce((a, b) => a + b, 0);

    // Calculate TIME_CELL_SIZES from TIME_SPACINGS
    // Each cell size is the average of its flanking spacings
    TIME_CELL_SIZES = new Array(n);
    for (let i = 0; i < n; i++) {
        let leftSpacing = TIME_SPACINGS[i] / 2;
        if(i === 0) leftSpacing = TIME_SPACINGS[0]; // First cell gets full first spacing
        let rightSpacing = TIME_SPACINGS[i + 1] / 2;
        if(i === n - 1) rightSpacing = TIME_SPACINGS[n]; // Last cell gets full last spacing
        TIME_CELL_SIZES[i] = leftSpacing + rightSpacing;
    }
}

/**
 * Find the closest data point to a given date
 * @param {Array} dataPoints - Array of data points with time property
 * @param {Array} dates - Array of dates to search within
 * @param {Date|number} targetDate - Target date to find closest point to
 * @param {Function} validator - Optional validator function for data points
 * @returns {{index: number, point: Object}|null}
 */
function findClosestDataPoint(dataPoints, dates, targetDate, validator = null) {
    let closestIdx = -1;
    let minDiff = Infinity;
    
    dataPoints.forEach((point, i) => {
        if (validator && !validator(point)) return;
        
        const pointDate = dates[i];
        const diff = Math.abs(pointDate - targetDate);
        if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
        }
    });
    
    return closestIdx !== -1 ? { index: closestIdx, point: dataPoints[closestIdx] } : null;
}

// ============================================================================
// Scale Creation Utilities
// ============================================================================

/**
 * Create a time scale for x-axis
 * @param {Date} minDate - Minimum date
 * @param {Date} maxDate - Maximum date
 * @param {number} width - Scale width
 * @returns {d3.scaleTime}
 */
function createTimeScale(minDate, maxDate, width) {
    return d3.scaleTime()
        .domain([minDate, maxDate])
        .range([0, width]);
}

/**
 * Create a linear scale for y-axis
 * @param {number} minDate - Minimum value
 * @param {number} maxDate - Maximum value
 * @param {number} height - Scale height
 * @returns {d3.scaleLinear}
 */
function createLinearScale(minDate, maxDate, height) {
    return d3.scaleLinear()
        .domain([minDate, maxDate])
        .range([height - 2, 2]);
}

// ============================================================================
// Color Scale Utilities
// ============================================================================

/**
 * Get D3 color interpolator based on SPECS.colorScale setting
 * Optionally inverts the interpolator if SPECS.invertColorScale is true
 * @returns {Function} D3 color interpolator function
 */
function getColorInterpolator(colorScaleName = SPECS.topicColorScale) {  
    const colorScales = {
        'Viridis': d3.interpolateViridis,
        'Inferno': d3.interpolateInferno,
        'Plasma': d3.interpolatePlasma,
        'Cool': d3.interpolateCool,
        'Warm': d3.interpolateWarm,
        'Turbo': d3.interpolateTurbo,
        'CubehelixDefault': d3.interpolateCubehelixDefault,
        "Green": d3.interpolateYlGn,
        "Purple": d3.interpolateRdPu,
        "Red": d3.interpolateYlOrRd,
        "Blue": d3.interpolateBlues,
    };
    
    let interpolator = colorScales[colorScaleName] || d3.interpolateInferno;
    const invertedScales = ['Red', 'Purple', 'Green', 'Blue'];
    // Invert the interpolator if needed
    if (SPECS.invertColorScale != invertedScales.includes(colorScaleName)) {
        const original = interpolator;
        interpolator = (t) => original(1 - t);
    }
    
    return interpolator;
}

/**
 * Create a color scale with appropriate scale type
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {Function} interpolator - D3 color interpolator (optional, uses SPECS.colorScale if not provided)
 * @returns {d3.scaleSequential}
 */
function createColorScale(min, max, customColorScale = null, customScaleType = null) {

    let colorScaleName = customColorScale;
    let scaleType = customScaleType;

    if ( !colorScaleName || !scaleType) {
        if (CURRENT_VIEW === 'metadata') {
            colorScaleName = SPECS.metadataColorScale;
            scaleType = SPECS.metadataColorScaleType;
        } else if (CURRENT_VIEW === 'otu') {
            colorScaleName = SPECS.otuColorScale;
            scaleType = SPECS.otuColorScaleType;
        } else {
            colorScaleName = SPECS.topicColorScale;
            scaleType = SPECS.topicColorScaleType;
        }
    }
        
    const colorInterpolator = getColorInterpolator(colorScaleName);
    
    let scale;
    switch (scaleType) {
        case 'linear':
            scale = d3.scaleSequential(colorInterpolator);
            break;
        case 'quadratic':
            scale = d3.scaleSequentialPow().exponent(2).interpolator(colorInterpolator);
            break;
        case 'cubic':
            scale = d3.scaleSequentialPow().exponent(3).interpolator(colorInterpolator);
            break;
        case 'cubeRoot':
            scale = d3.scaleSequentialPow().exponent(1/3).interpolator(colorInterpolator);
            break;
        case 'squareRoot':
        default:
            scale = d3.scaleSequentialSqrt(colorInterpolator);
    }
    
    return scale.domain([min, max]);
}

function interpolateScale(value, inverse = false, scaleType = SPECS.topicColorScaleType) {
    let exponent = 1;
    switch(scaleType) {
        case 'squareRoot':
            exponent = 1/2;
            break;
        case 'cubeRoot':
            exponent = 1/3;
            break;
        case 'quadratic':
            exponent = 2;
            break;
        case 'cubic':
            exponent = 3;
            break;
        case 'linear':
        default:
            break;
    }
    return inverse ? Math.pow(value, 1/exponent) : Math.pow(value, exponent);
}


function hexToLightness(hex) {
    if (!hex || typeof hex !== 'string') return 50;  // Default to mid-gray if invalid
    
    let r, g, b;
    //Handle rgb() format
    if (hex.startsWith('rgb')) {
        const rgbValues = hex.match(/\d+/g).map(Number);
        if (rgbValues.length < 3) return 50; // Not enough color info
        r = rgbValues[0] / 255;
        g = rgbValues[1] / 255;
        b = rgbValues[2] / 255;
    } else {
        hex = hex.replace(/^#/, '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        r = parseInt(hex.substr(0, 2), 16) / 255;
        g = parseInt(hex.substr(2, 2), 16) / 255;
        b = parseInt(hex.substr(4, 2), 16) / 255;
    }

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    return Math.round(((max + min) / 2) * 100);  // 0–100
}

/**
 * Create a timeline (horizontal or vertical)
 * @param {Array<string>} labels - Date or place labels
 * @param {number} width - Width of the timeline
 * @param {number} height - Height of the timeline
 * @param {boolean} isVertical - Whether to create vertical timeline
 * @returns {Object} SVG element and update function
 */
function createTimeline(labels, width, height, isVertical = false, invert = false) {
    const svg = d3.create('svg')
        .attr('class', 'timeline-svg')
        .attr('width', '100%')
        .attr('height', '100%');
    
    const leftPadding = isVertical ? 80 : 0;
    
    const g = svg.append('g')
        .attr('class', 'timeline-content')
        .attr('transform', `translate(${leftPadding}, 0)`);
    
    let scale, axis;
    
    const dates = parseDateLabels(labels);
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    const spanMs = maxDate.getTime() - minDate.getTime();
    const startPadding = TIME_SPACINGS[0] / TIME_SPACINGS_SUM;
    const endPadding = TIME_SPACINGS[TIME_SPACINGS.length - 1] / TIME_SPACINGS_SUM;
    const contentFraction = 1 - startPadding - endPadding;

    const extendBefore = spanMs * (startPadding / contentFraction);
    const extendAfter = spanMs * (endPadding / contentFraction);
    
    const extendedMinDate = new Date(minDate.getTime() - extendBefore);
    const extendedMaxDate = new Date(maxDate.getTime() + extendAfter);
    
    if (isVertical) {
        scale = d3.scaleTime()
            .domain(invert ? [extendedMaxDate, extendedMinDate] : [extendedMinDate, extendedMaxDate])
            .range([0, height]);

        axis = d3.axisLeft(scale)
            .tickFormat(d3.timeFormat('%d-%m-%Y'));
    } else {
        scale = d3.scaleTime()
            .domain(invert ? [extendedMaxDate, extendedMinDate] : [extendedMinDate, extendedMaxDate])
            .range([0, width - leftPadding]);
        
        axis = d3.axisBottom(scale)
            .tickFormat(d3.timeFormat('%d-%m-%Y'));
    }
    
    g.call(axis);
    
    // Attach minDate and maxDate to scale object for easier access
    scale.minDate = extendedMinDate;
    scale.maxDate = extendedMaxDate;
    
    return {
        svg: svg,
        g: g,
        scale: scale,
        axis: axis,
        dates: dates,
        labels: labels,
        minDate: extendedMinDate,
        maxDate: extendedMaxDate
    };
}

function timeTickInterval(zoomLevel, minDate, maxDate) {
    // Safety check: ensure minDate and maxDate are valid Date objects
    if (!minDate || !maxDate || typeof minDate.getTime !== 'function' || typeof maxDate.getTime !== 'function') {
        return d3.timeDay.every(1); // Default to daily ticks
    }
    
    const spanMs = (maxDate.getTime() - minDate.getTime()) / zoomLevel;
    let tickInterval;

    const day = 1000 * 60 * 60 * 24;
    if (spanMs < day * 7) { // Less than 1 week
        tickInterval = d3.timeDay.every(1);
    } else if (spanMs < day * 30) { // Less than 1 month
        tickInterval = d3.timeDay.every(3);
    } else if (spanMs < day * 30 * 3) { // Less than 3 months
        tickInterval = d3.timeWeek.every(1);
    } else if (spanMs < day * 365 * 2) { // Less than 2 years
        tickInterval = d3.timeMonth.every(1);
    } else {
        tickInterval = d3.timeMonth.every(3);
    }
    return tickInterval;
}

function createCoordScale(minVal, maxVal, width, height, isVertical = false, invert = false) {
    const svg = d3.create('svg')
        .attr('class', 'coordScale-svg')
        .attr('width', '100%')
        .attr('height', '100%');
    
    const leftPadding = isVertical ? 80 : 0;

    const g = svg.append('g')
        .attr('class', 'coordScale-content')
        .attr('transform', `translate(${leftPadding}, 0)`);
    
    let scale, axis;
    
    // Format function for coordinate labels with directional indicators
    const formatCoordLabel = (value) => {
        const absValue = Math.abs(value);
        let direction = '';
        
        if (PLACE_CATEGORY === 'latitude') {
            direction = value >= 0 ? '°N' : '°S';
        } else if (PLACE_CATEGORY === 'longitude') {
            direction = value >= 0 ? '°E' : '°W';
        }
        
        return absValue.toFixed(2) + direction;
    };
    
    if (isVertical) {
        scale = d3.scaleLinear()
            .domain(invert ? [maxVal, minVal] : [minVal, maxVal])
            .range([0, height]);

        axis = d3.axisLeft(scale)
            .tickFormat(formatCoordLabel);
    } else {
        scale = d3.scaleLinear()
            .domain(invert ? [maxVal, minVal] : [minVal, maxVal])
            .range([0, width - leftPadding]);
        
        axis = d3.axisBottom(scale)
            .tickFormat(formatCoordLabel);
    }
    
    g.call(axis);
    
    return {
        svg: svg,
        g: g,
        scale: scale,
        axis: axis
    };
}

/**
 * Create label boxes for swapped axes (place labels as equal-width boxes)
 * Similar structure to createTimeline for consistency
 * @param {Array} labels - Array of label strings
 * @param {number} width - Width of the SVG
 * @param {number} height - Height of the SVG
 * @param {string} idPrefix - Optional prefix for IDs to distinguish between main and detail views (e.g., 'detail')
 */
function createLabelBoxes(labels, width, height, idPrefix = '', colors = []) {
    let labelsText = labels;
    if(SPECS.showPlaceNameLabels) {
        labelsText = ACTIVE_SITES.map(siteId => {
            return SITE_NAMES[siteId - 1] || `s${siteId}`;
        });
    }

    const svg = d3.create('svg')
        .attr('class', 'x-labels-svg')
        .attr('id', idPrefix ? `${idPrefix}-x-labels-svg` : '')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'none')
        .style('display', 'block');

    xLabelWidthOnInit = width;
    
    const cellWidth = width / labelsText.length;
    const labelsGroup = svg.append('g')
        .attr('class', 'x-labels-group')
        .attr('id', idPrefix ? `${idPrefix}-x-labels-group` : '');
    
    // Apply custom cell sizes for place labels if applicable
    let accWidth = 0;
    labelsText.forEach((label, idx) => {
        const customCellWidth = cellWidth * (X_CATEGORY === 'place' && (labelsText.length > 1) ? (PLACE_CELL_SIZES[idx] || 1) : 1);
        const labelGroup = labelsGroup.append('g')
            .attr('class', 'x-label-box')
            .attr('transform', `translate(${accWidth}, 0)`);

        // Background rectangle
        labelGroup.append('rect')
            .attr('class', 'x-label-bg')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', customCellWidth)
            .attr('height', height)
            .attr('fill', 'none')
        
        const textColor = colors.length > 0 ? (hexToLightness(colors[idx]) > 40 ? '#000000' : '#ffffff') : 'var(--primary-light)';
        // Text label with word wrapping
        const textEl = labelGroup.append('text')
            .attr('class', 'x-label-text')
            .attr('x', customCellWidth / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .attr('data-cell-width', customCellWidth)
            .attr('data-cell-height', height)
            .style('fill', textColor);
        
        formatXLabelText(textEl, customCellWidth, height, label);
        accWidth += customCellWidth;
    });
    
    return {
        svg: svg,
        g: labelsGroup
    };
}

/**
 * Create vertical label boxes for swapped axes (place labels as equal-height boxes)
 * Similar structure to createLabelBoxes but for vertical layout
 * @param {Array} labels - Array of label strings
 * @param {number} width - Width of the SVG
 * @param {number} height - Height of the SVG
 * @param {string} idPrefix - Optional prefix for IDs to distinguish between main and detail views (e.g., 'detail')
 * @param {Array} colors - Optional array of colors for each label
 */
function createVerticalLabelBoxes(labels, width, height, idPrefix = '', colors = []) {
    let labelsText = labels;
    if(SPECS.showPlaceNameLabels) {
        labelsText = ACTIVE_SITES.map(siteId => {
            return SITE_NAMES[siteId - 1] || `s${siteId}`;
        });
    }

    const svg = d3.create('svg')
        .attr('class', 'y-labels-svg')
        .attr('id', idPrefix ? `${idPrefix}-y-labels-svg` : '')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'none')
        .style('display', 'block');

    yLabelHeightOnInit = height;
    
    const cellHeight = height / labelsText.length;
    const labelsGroup = svg.append('g')
        .attr('class', 'y-labels-group')
        .attr('id', idPrefix ? `${idPrefix}-y-labels-group` : '');
    
    // Apply custom cell sizes for place labels if applicable
    let accHeight = 0;
    labelsText.forEach((label, idx) => {
        const customCellHeight = cellHeight * (Y_CATEGORY === 'place' && (labelsText.length > 1) ? (PLACE_CELL_SIZES[idx] || 1) : 1);
        const labelGroup = labelsGroup.append('g')
            .attr('class', 'y-label-box')
            .attr('transform', `translate(0, ${accHeight})`);
        
        // Background rectangle
        labelGroup.append('rect')
            .attr('class', 'y-label-bg')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', width)
            .attr('height', customCellHeight)
            .attr('fill', 'none')
        
        const textColor = colors.length > 0 ? (hexToLightness(colors[idx]) > 40 ? '#000000' : '#ffffff') : 'var(--primary-light)';
        // Text label with word wrapping
        const textEl = labelGroup.append('text')
            .attr('class', 'y-label-text')
            .attr('x', width / 2)
            .attr('y', customCellHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .attr('data-cell-width', width)
            .attr('data-cell-height', customCellHeight)
            .style('fill', textColor);
        
        // Format text with word wrapping using shared function
        formatYLabelText(textEl, width, customCellHeight, label);
        accHeight += customCellHeight;
    });
    
    return {
        svg: svg,
        g: labelsGroup
    };
}

/**
 * Fetch CSV data from server
 * @param {Object} payload - Request payload
 * @returns {Promise<{csv: string, axis: any}|null>}
 */
async function fetchCSVData(payload) {
    try {
        const query = encodeURIComponent(JSON.stringify(payload));
        const response = await fetch(`/data?attribute=${query}`);
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const json = await response.json();
            return { csv: json.csv || '', axis: json.axis || null, times: json.times || null };
        } else {
            const text = await response.text();
            return { csv: text, axis: null, times: null };
        }
    } catch (error) {
        console.error('Error fetching CSV data:', error);
        return null;
    }
}

// ============================================================================
// Payload Generation Utilities
// ============================================================================

function generateSampleSpec(average = 'false', allPlaces = false) {
    const minDate = (AXES_SWAPPED && CURRENT_VIEW === 'main') ? MIN_DATE : '01-01-1900';
    const maxDate = (AXES_SWAPPED && CURRENT_VIEW === 'main') ? MAX_DATE : '01-01-2100';
    return {
        "time": {
            "from": minDate,
            "to": maxDate
        },
        "place": {
            "site": {
                "type": allPlaces ? "all" : "list",
                "value": ACTIVE_SITES
            }
        },
        "average": `${average}`
    };
}

function generateMainHeatMapPayload() {
    return {
        "file": `Output/${DATA_SET}/TM_Topics/${TOPIC_SET}_topics.csv`,
        "data_set": `${DATA_SET}`,
        "table_type": "topic",
        "specs": {
            "sample": generateSampleSpec(Y_CATEGORY),
            "id": {
                "type": "all",
                "value": [],
                "average": "false"
            }
        }
    };
}

/**
 * Generate request payload based on base payload and modifications
 * @param {Object} basePayload - Base payload structure
 * @param {Object} modifications - Modifications to apply
 * @returns {Object} Modified payload
 */
function generatePayload(basePayload, modifications = {}) {
    const payload = JSON.parse(JSON.stringify(basePayload));
    
    // Apply modifications
    if (modifications.id !== undefined) {
        payload.id = modifications.id;
        if (payload.specs) {
            payload.specs.id = modifications.id;
        }
    }
    
    if (modifications.average !== undefined) {
        if (payload.specs && payload.specs.sample) {
            payload.specs.sample.average = modifications.average;
        }
    }
    
    if (modifications.attribute !== undefined) {
        if (payload.specs) {
            payload.specs.attribute = modifications.attribute;
        }
    }
    
    if (modifications.time !== undefined) {
        if (payload.specs && payload.specs.sample) {
            payload.specs.sample.time = modifications.time;
        }
    }
    
    if (modifications.place !== undefined) {
        if (payload.specs && payload.specs.sample) {
            payload.specs.sample.place = modifications.place;
        }
    }
    
    return payload;
}

// ============================================================================
// Label Generation
// ============================================================================

/**
 * Format and wrap text in x-label elements with tspans
 * Called during zoom/resize to reflow text appropriately
 * @param {d3.Selection} textElement - D3 selection of text element
 * @param {number} cellWidth - Width of the cell
 * @param {number} cellHeight - Height of the cell
 * @param {string} labelText - Optional text content. If not provided, extracts from existing element
 */
function formatXLabelText(textElement, cellWidth, cellHeight, labelText = null) {
    // Validate parameters
    if (!cellWidth || !cellHeight || isNaN(cellWidth) || isNaN(cellHeight)) {
        return;
    }
    
    // Get the text content from parameter, or extract from tspans or text node
    let textContent = labelText;
    if (!textContent) {
        const tspans = textElement.selectAll('tspan');
        if (!tspans.empty()) {
            textContent = tspans.nodes().map(n => n.textContent).join(' ');
        } else {
            textContent = textElement.text();
        }
    }
    
    // Clear existing tspans
    textElement.selectAll('tspan').remove();
    
    // Calculate line wrapping based on new cell width
    const maxCharsPerLine = Math.max(5, Math.floor((cellWidth - 4) / 7));
    const words = String(textContent).split(/\s+/);
    let currentLine = '';
    const lineHeight = 14;
    const lines = [];
    
    // Build lines
    words.forEach((word) => {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (testLine.length > maxCharsPerLine && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    });
    
    if (currentLine) {
        lines.push(currentLine);
    }
    
    // Calculate vertical offset to center all lines
    const totalLineHeight = (lines.length - 1) * lineHeight;
    const startY = cellHeight / 2 - totalLineHeight / 2;
    
    // Render all lines as tspans
    lines.forEach((line, lineIdx) => {
        textElement.append('tspan')
            .attr('x', cellWidth / 2)
            .attr('y', lineIdx === 0 ? startY : null)
            .attr('dy', lineIdx === 0 ? null : lineHeight)
            .text(line);
    });
}

/**
 * Format text for vertical label boxes with word wrapping based on cell height
 * @param {Object} textElement - D3 selection of the text element
 * @param {number} cellWidth - Width of the cell
 * @param {number} cellHeight - Height of the cell
 * @param {string} labelText - Optional text content. If not provided, extracts from existing element
 */
function formatYLabelText(textElement, cellWidth, cellHeight, labelText = null) {
    // Validate parameters
    if (!cellWidth || !cellHeight || isNaN(cellWidth) || isNaN(cellHeight)) {
        console.warn('formatYLabelText: Invalid cellWidth or cellHeight', {cellWidth, cellHeight, textElement: textElement?.node?.()});
        console.trace('Call stack:');
        return;
    }
    
    // Get the text content from parameter, or extract from tspans or text node
    let textContent = labelText;
    if (!textContent) {
        const tspans = textElement.selectAll('tspan');
        if (!tspans.empty()) {
            textContent = tspans.nodes().map(n => n.textContent).join(' ');
        } else {
            textContent = textElement.text();
        }
    }
    
    // Clear existing tspans
    textElement.selectAll('tspan').remove();
    
    // Calculate line wrapping based on new cell height
    const maxCharsPerLine = Math.max(5, Math.floor((cellHeight - 4) / 7));
    const words = String(textContent).split(/\s+/);
    let currentLine = '';
    const lineHeight = 14;
    const lines = [];
    
    // Build lines
    words.forEach((word) => {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (testLine.length > maxCharsPerLine && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    });
    
    if (currentLine) {
        lines.push(currentLine);
    }
    
    // Calculate horizontal offset to center all lines
    const totalLineHeight = (lines.length - 1) * lineHeight;
    const startY = cellHeight / 2 - totalLineHeight / 2;
    
    // Render all lines as tspans
    lines.forEach((line, lineIdx) => {
        textElement.append('tspan')
            .attr('x', cellWidth / 2)
            .attr('y', lineIdx === 0 ? startY : null)
            .attr('dy', lineIdx === 0 ? null : lineHeight)
            .text(line);
    });
}

function nameOfTopic(topicId) {
    if (TOPIC_NAMES[TOPIC_SET] && TOPIC_NAMES[TOPIC_SET][topicId]) {
        return TOPIC_NAMES[TOPIC_SET][topicId];
    } else {
        return `Topic ${topicId}`;
    }
}

function updateTopicName(topicId, newName) {
    // Update y-labels in the heatmap by finding the label at index topicId
    const yLabelsSvg = document.querySelector('.labels-svg');
    if (yLabelsSvg) {
        const labelRows = yLabelsSvg.querySelectorAll('g.label-row');
        const textEl = labelRows[topicId].querySelector('text');
        if (textEl) {
            textEl.textContent = newName;
        }
    }
    
    // Update left sidepanel topic selection section by finding element with matching data-topicIndex
    const topicSelectionSection = document.getElementById('topic-selection-section');
    if (topicSelectionSection) {
        const panelList = topicSelectionSection.querySelectorAll('.panel-item');
        if (panelList[topicId]) {
            const spanEl = panelList[topicId].querySelector('span');
            if (spanEl) {
                spanEl.textContent = newName;
            }
        }
    }
}

async function resetTopicNames(type) {
    const params = new URLSearchParams({
        dataSet: DATA_SET,
        topicSet: TOPIC_SET,
        topicID: '',
        topicName: type,
        renameThreshold: 2
    });
    postAndFetchTopicName(params);
    closeOptionsOverlay();
    // Wait 500ms to ensure file is written on server before reloading
    await new Promise(resolve => setTimeout(resolve, 500));
    localStorage.clear();
    location.reload();
}

function postAndFetchTopicName(params) {
    fetch(`/topic_name?${params}`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            const allNames = data.topic_names || {};
            TOPIC_NAMES = allNames[SPECS.dataSet] || {};
        })
        .catch(error => console.error('Error updating topic name:', error));
}

/**
 * Create Y-axis labels SVG with label groups
 * @param {Array<string>} rowLabels - Array of row label strings
 * @param {number} cellHeight - Height of each cell/row
 * @param {number} containerHeight - Total height of the container
 * @param {number} containerWidth - Width of the container
 * @returns {Object} Object containing svg node and label groups selection
 */
function createYLabels(rowLabels, cellHeight, containerHeight, containerWidth) {
    const yLabelsSvg = d3.create('svg')
        .attr('class', 'labels-svg')
        .attr('width', '100%')
        .attr('height', containerHeight);

    const labelTexts = [];
    for(let i=0; i<rowLabels.length; i++){
        labelTexts[i] = nameOfTopic(rowLabels[i]);
    }
    
    const yLabelGroups = yLabelsSvg.selectAll('g.label-row')
        .data(labelTexts)
        .enter()
        .append('g')
        .attr('class', 'label-row')
        .attr('transform', (_,i) => `translate(0, ${i * cellHeight})`);
    
    // Background group for 1D vertical heatmap
    const bgGroups = yLabelGroups.append('g')
        .attr('class', 'place-heatmap-bg');
    
    // Add background rect to mark the cell area - use 100% width for dynamic resizing
    bgGroups.append('rect')
        .attr('class', 'bg-rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', '100%')
        .attr('height', cellHeight)
        .attr('fill', 'transparent')
        .attr('stroke', 'black')
        .attr('stroke-width', 1);
    
    // Text on top - font size relative to cell height
    const fontSize = Math.max(8, Math.min(cellHeight * 0.5, 20));
    yLabelGroups.append('text')
        .attr('x', '95%')
        .attr('y', 4)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'hanging')
        .style('font-size', `${fontSize}px`)
        .style('fill', 'var(--primary-light)')
        .text(d => d);
    
    return {
        svg: yLabelsSvg,
        groups: yLabelGroups
    };
}

// ============================================================================
// Date Range Slider
// ============================================================================

/**
 * Initialize a dual-knob date range slider
 */
function initializeDateRangeSlider(dates, sliderSection, type = 'main', singleKnob = false) {
    if (!dates || dates.length === 0) return;
    
    // Clear existing content
    sliderSection.innerHTML = '';
    
    // Create slider container
    const container = document.createElement('div');
    container.className = 'date-range-slider-container';
    
    // Create slider track
    const track = document.createElement('div');
    track.className = 'slider-track';
    
    // Create range highlight
    const range = document.createElement('div');
    range.className = 'slider-range';
    track.appendChild(range);
    
    // Create knobs and readouts
    const knob1 = document.createElement('div');
    knob1.className = 'slider-knob slider-knob-1';
    knob1.setAttribute('data-knob', '1');
    
    let knob2 = null;
    if (!singleKnob) {
        knob2 = document.createElement('div');
        knob2.className = 'slider-knob slider-knob-2';
        knob2.setAttribute('data-knob', '2');
    }
    
    const readout1 = document.createElement('div');
    readout1.className = 'slider-readout slider-readout-1';
    readout1.style.color = type === 'main' ? 'var(--text-dark)' : 'var(--text-light)';
    
    let readout2 = null;
    if (!singleKnob) {
        readout2 = document.createElement('div');
        readout2.className = 'slider-readout slider-readout-2';
        readout2.style.color = type === 'main' ? 'var(--text-dark)' : 'var(--text-light)';
        track.appendChild(readout2);
    }
    
    track.appendChild(knob1);
    if (knob2) track.appendChild(knob2);
    track.appendChild(readout1);
    
    container.appendChild(track);
    sliderSection.appendChild(container);
    
    // Show slider section
    sliderSection.style.display = 'flex';

    let startIdx = dates.indexOf(MIN_DATE);
    if(type === 'detail') startIdx = dates.indexOf(MAP_MIN_DATE);
    if(startIdx === -1) startIdx = 0;
    let endIdx = dates.indexOf(MAX_DATE);
    if(type === 'detail') endIdx = dates.indexOf(MAP_MAX_DATE);
    if(endIdx === -1) endIdx = dates.length - 1;
    
    // Helper to get pixel position from index
    function getPixelFromIndex(idx) {
        return (idx / (dates.length - 1)) * 100;
    }
    
    // Helper to get index from pixel position
    function getIndexFromPixel(percent) {
        const idx = Math.round((percent / 100) * (dates.length - 1));
        return Math.max(0, Math.min(idx, dates.length - 1));
    }
    
    // Update readouts and globals
    function updateReadouts() {
        if(type === 'main') {
            MIN_DATE = dates[startIdx];
            MAX_DATE = dates[endIdx];
        } else if(type === 'detail') {
            MAP_MIN_DATE = dates[startIdx];
            MAP_MAX_DATE = dates[endIdx];
        }
        
        // Update global date range
        readout1.textContent = type === 'main' ? MIN_DATE : MAP_MIN_DATE;
        if (readout2) readout2.textContent = type === 'main' ? MAX_DATE : MAP_MAX_DATE;
    }
    
    // Debounced callback for slider changes
    let sliderChangeTimeout = null;
    function triggerSliderChanged() {
        if (sliderChangeTimeout !== null) clearTimeout(sliderChangeTimeout);
        sliderChangeTimeout = setTimeout(() => {
            localStorage.setItem('MIN_DATE', MIN_DATE);
            localStorage.setItem('MAX_DATE', MAX_DATE);

            initializeMainView();
            sliderChangeTimeout = null;
        }, 100);
    }
    
    // Update visual positions
    function updateVisuals(shouldTriggerCallback = true) {
        const left = getPixelFromIndex(startIdx);
        const right = getPixelFromIndex(endIdx);
        
        knob1.style.left = left + '%';
        if (knob2) knob2.style.left = right + '%';
        
        if (singleKnob) {
            // For single knob mode, position range at the knob location
            range.style.left = left + '%';
            range.style.right = (100 - left) + '%';
        } else {
            range.style.left = left + '%';
            range.style.right = (100 - right) + '%';
        }
        
        // Position readouts with knobs
        readout1.style.left = left + '%';
        if (readout2) readout2.style.left = right + '%';
        
        updateReadouts();
        if (shouldTriggerCallback) {
            if(type === 'main') {
                triggerSliderChanged();
            } else if(type === 'detail') {
                detailTimeSliderChanged();
            }
            
        }
    }
    
    // Mouse down handler
    let activeKnob = null;
    
    function onMouseDown(e) {
        if (e.button !== 0) return; // Only left mouse button
        
        const knobNum = parseInt(e.target.getAttribute('data-knob'));
        if (isNaN(knobNum)) return;
        
        activeKnob = knobNum;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
    }
    
    function onMouseMove(e) {
        if (activeKnob === null) return;
        
        const trackRect = track.getBoundingClientRect();
        const mouseX = e.clientX - trackRect.left;
        const percent = Math.max(0, Math.min(100, (mouseX / trackRect.width) * 100));
        const newIdx = getIndexFromPixel(percent);
        
        if (singleKnob) {
            // In single knob mode, both dates are the same
            startIdx = newIdx;
            endIdx = newIdx;
        } else {
            if (activeKnob === 1) {
                startIdx = Math.min(newIdx, endIdx);
            } else if (activeKnob === 2) {
                endIdx = Math.max(newIdx, startIdx);
            }
        }
        
        updateVisuals();
    }
    
    function onMouseUp() {
        activeKnob = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
    
    // Touch support
    function onTouchStart(e) {
        const knobNum = parseInt(e.target.getAttribute('data-knob'));
        if (isNaN(knobNum)) return;
        
        activeKnob = knobNum;
        document.addEventListener('touchmove', onTouchMove);
        document.addEventListener('touchend', onTouchEnd);
        e.preventDefault();
    }
    
    function onTouchMove(e) {
        if (activeKnob === null) return;
        
        const trackRect = track.getBoundingClientRect();
        const touch = e.touches[0];
        const mouseX = touch.clientX - trackRect.left;
        const percent = Math.max(0, Math.min(100, (mouseX / trackRect.width) * 100));
        const newIdx = getIndexFromPixel(percent);
        
        if (singleKnob) {
            // In single knob mode, both dates are the same
            startIdx = newIdx;
            endIdx = newIdx;
        } else {
            if (activeKnob === 1) {
                startIdx = Math.min(newIdx, endIdx);
            } else if (activeKnob === 2) {
                endIdx = Math.max(newIdx, startIdx);
            }
        }
        
        updateVisuals();
    }
    
    function onTouchEnd() {
        activeKnob = null;
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
    }
    
    // Attach event listeners
    knob1.addEventListener('mousedown', onMouseDown);
    if (knob2) knob2.addEventListener('mousedown', onMouseDown);
    knob1.addEventListener('touchstart', onTouchStart);
    if (knob2) knob2.addEventListener('touchstart', onTouchStart);
    
    // Initialize (without triggering callback)
    updateVisuals(false);
}

function updateSliderVisibility() {
    const sliderSection = document.getElementById('slider-section');
    const chartContainer = document.getElementById('chart-container');
    const heatMapSection = document.getElementById('heatmap-section');
    
    if (AXES_SWAPPED) {
        if (sliderSection) {
            sliderSection.style.display = 'flex';
            sliderSection.style.visibility = 'visible';
            sliderSection.style.height = '';
            sliderSection.style.minHeight = '';
            sliderSection.style.overflow = '';
        }
        if (chartContainer) chartContainer.style.gridTemplateRows = '40px 1fr 50px 100px';
    } else {
        if (sliderSection) {
            sliderSection.style.display = 'none';
            sliderSection.style.visibility = 'hidden';
            sliderSection.style.height = '0';
            sliderSection.style.minHeight = '0';
            sliderSection.style.overflow = 'hidden';
        }
        if (chartContainer) chartContainer.style.gridTemplateRows = '0px 1fr 50px 100px';
    }
    // Use persistent heights if available, otherwise use defaults
    let heatmapHeight, lineGraphHeight;
    const storedLineGraphHeight = parseInt(localStorage.getItem('LINEGRAPH_HEIGHT'));
    if (storedLineGraphHeight) {
        lineGraphHeight = storedLineGraphHeight;
    } else {
        lineGraphHeight = 100;
    }

    heatmapHeight = chartContainer.clientHeight - (AXES_SWAPPED ? 40 : 0) - 50 - lineGraphHeight;
    
    if (heatMapSection && heatMapSection._movementHandler) {
        heatMapSection._movementHandler.updateVerticalLayout(heatmapHeight, lineGraphHeight);
    }
}

// ============================================================================
// Generic Overlay Creation
// ============================================================================

/**
 * Create a generic overlay window with header, content, and footer
 * @param {string} className - CSS class name for the overlay (e.g., 'options-overlay')
 * @param {string} title - Title text for the header
 * @param {HTMLElement} contentElement - Element to place in the content area
 * @param {HTMLElement|null} footerElement - Optional footer element
 * @param {Function} onBackClick - Callback for back button click
 * @param {string|null} customWidth - Optional custom width (e.g., '95vw')
 * @param {string|null} customHeight - Optional custom height (e.g., '65vh')
 * @returns {HTMLElement} The overlay element
 */
function createOverlay(className, title, contentElement, footerElement, onBackClick, customWidth = null, customHeight = null) {
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.className = className;
    
    // Create overlay window
    const overlayWindow = document.createElement('div');
    overlayWindow.className = 'overlay-window';
    
    // Apply custom dimensions if provided
    if (customWidth) overlayWindow.style.width = customWidth;
    if (customHeight) overlayWindow.style.height = customHeight;
    
    // Create header with back button
    const header = document.createElement('div');
    header.className = 'overlay-header';
    
    const backBtn = document.createElement('button');
    backBtn.className = 'overlay-back-btn';
    backBtn.textContent = '←';
    backBtn.addEventListener('click', onBackClick);
    
    const titleElement = document.createElement('h2');
    titleElement.textContent = title;
    
    header.appendChild(backBtn);
    header.appendChild(titleElement);
    
    overlayWindow.appendChild(header);
    overlayWindow.appendChild(contentElement);
    
    // Add footer if provided
    if (footerElement) {
        overlayWindow.appendChild(footerElement);
    }
    
    overlay.appendChild(overlayWindow);
    return overlay;
}

function createLegend(vmin, vmax) {
    let scaleType;
    if (CURRENT_VIEW === 'metadata') {
        scaleType = SPECS.metadataColorScaleType;
    } else if (CURRENT_VIEW === 'otu') {
        scaleType = SPECS.otuColorScaleType;
    } else {
        scaleType = SPECS.topicColorScaleType;
    }

    const color = createColorScale(vmin, vmax);
    const legendContainer = document.getElementById('legend-container');
    legendContainer.innerHTML = '';

    const legendSvg = d3.create('svg')
        .attr('class', 'legend-svg')
        .attr('width', '100%')
        .attr('height', legendContainer.clientHeight);
    
    const gid = 'legend-grad-' + Date.now();
    const grad = legendSvg.append('defs')
        .append('linearGradient')
        .attr('id', gid)
        .attr('x1', '0%')
        .attr('x2', '100%')
        .attr('y1', '0%')
        .attr('y2', '0%');
    
    const stops = 10;
    for(let i=0; i<=stops; i++){
        grad.append('stop')
            .attr('offset', `${(i/stops)*100}%`)  // equal distances
            .attr('stop-color', color(vmin + (interpolateScale(i/stops, true, scaleType))*(vmax - vmin)));
    }

    legendSvg.append('rect')
        .attr('x', '5%')
        .attr('y', '10%')
        .attr('width', '90%')
        .attr('height', '40%')
        .attr('fill', `url(#${gid})`);

    const legendValueTexts = [];
    const labelcount = 5;
    const step = (vmax - vmin) / (labelcount - 1);
    const magnitude = Math.pow(10, 2 - Math.floor(Math.log10((vmax - vmin) * 2)));
    for(let i = 0; i < labelcount; i++){
        const val = vmin + step * i;
        let pos = interpolateScale(i/(labelcount - 1), false, scaleType) * 90 + 5; // match the gradient stops
        const textEl = legendSvg.append('text')
            .attr('x', `${pos}%`)
            .attr('y', '75%')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .style('fill', 'var(--text-light)')
            .text(Math.round(val*magnitude)/magnitude);
        legendValueTexts.push(textEl.node());
    }

    legendContainer.appendChild(legendSvg.node());
    
    return legendValueTexts;
}

function updateLegendValues(rangeType) {
    if (!LEGEND_TEXT || LEGEND_TEXT.length === 0) return;
    
    const range = VALUE_RANGES[rangeType];
    if (!range) return;
    
    const step = (range.max - range.min) / 4;
    const values = [range.min, range.min + step, range.min + step * 2, range.min + step * 3, range.max];
    const magnitude = Math.pow(10, 2 - Math.floor(Math.log10((range.max - range.min) * 2)));
    LEGEND_TEXT.forEach((textElement, i) => {
        d3.select(textElement).text(Math.round(values[i] * magnitude) / magnitude);
    });
}