// Line graph visualization and management functions

async function fetchAttributeCSV(attrNames){
    //check if attrNames is array or single string
    let attribute;
    if(Array.isArray(attrNames)){
        attribute = { "type": "list", "value": attrNames };
    } else {
        attribute = { "type": "single", "value": [attrNames] };
    }
    const payload = {
        "file": `Input/${DATA_SET}/metadata.csv`,
        "data_set": `${DATA_SET}`,
        "table_type": "metadata",
        "specs": {
            "sample": generateSampleSpec(Y_CATEGORY),
            "attribute": { ...attribute }
        }
    };

    const resp = await fetchCSVData(payload);
    const rows = parseAndValidateCSV(resp.csv);

    // If single attribute, return in the old format
    if(!Array.isArray(attrNames)){
        const xLabels = [];
        const data = [];
        for(let r=1;r<rows.length;r++){
            xLabels.push(rows[r][0]);
            const v = parseFloat(rows[r][1]);
            data.push({ label: rows[r][0], value: isNaN(v) ? null : v });
        }
        return { xLabels, data };
    }

    // For multiple attributes, return per-attribute format
    const attributeNames = rows[0].slice(1);
    const datasets = {};
    const xLabels = [];
    
    for(let r = 1; r < rows.length; r++){
        const xLabel = rows[r][0];
        if(r === 1) xLabels.push(xLabel);
        
        for(let c = 1; c < rows[r].length; c++){
            const val = parseFloat(rows[r][c]);
            const attrName = attributeNames[c - 1];
            if(!datasets[attrName]) datasets[attrName] = [];
            datasets[attrName].push({ label: xLabel, value: isNaN(val) ? null : val });
            if(r === 1) xLabels.push(xLabel);
        }
    }
    
    return datasets;
}

// Create a responsive graph-item and register it on dataObj.itemMap
function createGraphItemGlobal(listEl, attrName, dataObj){
    const item = document.createElement('div');
    item.className = 'graph-item';
    item.dataset.attrName = attrName;

    const label = document.createElement('div');
    label.className = 'graph-label';
    label.textContent = attrName;
    item.appendChild(label);

    const svg = d3.create('svg')
        .attr('class', 'linegraph-svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('preserveAspectRatio', 'none');

    const g = svg.append('g').attr('class', 'linegraph-content');
    g.append('rect').attr('class', 'bg-rect').attr('x', 0).attr('y', 0).attr('fill', 'var(--primary-dark)').attr('stroke', 'var(--primary-light)').attr('stroke-width', 1).attr('vector-effect', 'non-scaling-stroke');
    g.append('path').attr('class', 'line-path').attr('fill', 'none').attr('stroke', 'var(--primary-contrast)').attr('stroke-width', 2).attr('vector-effect', 'non-scaling-stroke');

    item.appendChild(svg.node());
    
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
        showDetailView('metadata', true, [attrName]);
    });
    
    listEl.appendChild(item);

    dataObj.itemMap[attrName] = { item, svg, g, label };
    return dataObj.itemMap[attrName];
}

async function addLineGraphAttribute(attrName){
    const lineGraphSection = document.getElementById('linegraph-section');
    if(!lineGraphSection) return;

    // Ensure initial data object exists
    let dataObj = lineGraphSection._lineGraphData;
    if(!dataObj){
        const list = document.createElement('div');
        list.className = 'graph-list';
        lineGraphSection.appendChild(list);
        dataObj = {
            datasets: {},
            attributeNames: [],
            dates: null,
            labels: [],
            minDate: null,
            maxDate: null,
            svgW: lineGraphSection.clientWidth,
            itemMap: {},
            list: list,
        };
        lineGraphSection._lineGraphData = dataObj;
    }

    // If attribute already present, do nothing
    if(dataObj.attributeNames.includes(attrName)) return;

    // Fetch CSV for this single attribute
    const fetched = await fetchAttributeCSV(attrName);

    // Append dataset
    dataObj.datasets[attrName] = fetched.data;
    dataObj.attributeNames.push(attrName);

    // Create new graph item in the list
    const list = dataObj.list || (function(){ const l = lineGraphSection.querySelector('.graph-list'); dataObj.list = l; return l; })();
    if(list){
        createGraphItemGlobal(list, attrName, dataObj);
    }

    // Update stored dates/labels range
    if(!AXES_SWAPPED){
        const newDates = parseDateLabels(fetched.xLabels);
        if(!dataObj.dates) {
            dataObj.dates = newDates;
        } else {
            const all = dataObj.dates.concat(newDates);
            const uniqMap = {};
            all.forEach(d => { if(d && d.getTime) uniqMap[d.getTime()] = d; });
            dataObj.dates = Object.values(uniqMap).sort((a,b) => a - b);
        }
        const times = dataObj.dates.map(d => d.getTime());
        dataObj.minDate = new Date(Math.min(...times));
        dataObj.maxDate = new Date(Math.max(...times));
    } else {
        dataObj.labels = fetched.xLabels;
    }

    // Trigger layout update
    dataObj.svgW = dataObj.svgW || lineGraphSection.clientWidth;
    updateLineGraphs(lineGraphSection, dataObj.svgW);
}

/**
 * Add multiple attributes at once with a single combined fetch request
 * This is more efficient than calling addLineGraphAttribute multiple times
 */
async function addLineGraphAttributesBatch(attrNames){
    const lineGraphSection = document.getElementById('linegraph-section');
    if(!lineGraphSection || !attrNames || attrNames.length === 0) return;

    // Ensure initial data object exists
    let dataObj = lineGraphSection._lineGraphData;
    if(!dataObj){
        const list = document.createElement('div');
        list.className = 'graph-list';
        lineGraphSection.appendChild(list);
        dataObj = {
            datasets: {},
            attributeNames: [],
            dates: null,
            labels: [],
            minDate: null,
            maxDate: null,
            svgW: lineGraphSection.clientWidth,
            itemMap: {},
            list: list,
        };
        lineGraphSection._lineGraphData = dataObj;
    }

    // Filter out attributes that are already present
    const newAttrs = attrNames.filter(name => !dataObj.attributeNames.includes(name));
    if(newAttrs.length === 0) return;

    // Fetch all new attributes in a single request
    const fetched = await fetchAttributeCSV(newAttrs);
    
    // Get list container
    const list = dataObj.list || (function(){ const l = lineGraphSection.querySelector('.graph-list'); dataObj.list = l; return l; })();

    // Process each fetched attribute
    let allXLabels = [];
    newAttrs.forEach(attrName => {
        const data = fetched[attrName];
        if(!data) return;

        // Add to datasets
        dataObj.datasets[attrName] = data;
        dataObj.attributeNames.push(attrName);

        // Create graph item
        if(list){
            createGraphItemGlobal(list, attrName, dataObj);
        }

        // Collect x-labels
        if(allXLabels.length === 0 && data.length > 0){
            allXLabels = data.map(d => d.label);
        }
    });

    // Update stored dates/labels range
    if(!AXES_SWAPPED && allXLabels.length > 0){
        const newDates = parseDateLabels(allXLabels);
        if(!dataObj.dates) {
            dataObj.dates = newDates;
        } else {
            const all = dataObj.dates.concat(newDates);
            const uniqMap = {};
            all.forEach(d => { if(d && d.getTime) uniqMap[d.getTime()] = d; });
            dataObj.dates = Object.values(uniqMap).sort((a,b) => a - b);
        }
        const times = dataObj.dates.map(d => d.getTime());
        dataObj.minDate = new Date(Math.min(...times));
        dataObj.maxDate = new Date(Math.max(...times));
    } else if(AXES_SWAPPED && allXLabels.length > 0){
        dataObj.labels = allXLabels;
    }

    // Trigger layout update once
    dataObj.svgW = dataObj.svgW || lineGraphSection.clientWidth;
    updateLineGraphs(lineGraphSection, dataObj.svgW);
}

function removeLineGraphAttribute(attrName){
    const lineGraphSection = document.getElementById('linegraph-section');
    if(!lineGraphSection || !lineGraphSection._lineGraphData) return;
    const dataObj = lineGraphSection._lineGraphData;
    const idx = dataObj.attributeNames.indexOf(attrName);
    if(idx === -1) return;

    // Remove dataset and name
    delete dataObj.datasets[attrName];
    dataObj.attributeNames.splice(idx, 1);

    // Remove DOM item
    const ref = dataObj.itemMap && dataObj.itemMap[attrName];
    if(ref && ref.item && ref.item.parentElement){
        ref.item.parentElement.removeChild(ref.item);
    }
    if(dataObj.itemMap) delete dataObj.itemMap[attrName];

    // If nothing left, clear section
    const graphCount = dataObj.attributeNames.length;
    if(graphCount === 0){
        lineGraphSection.innerHTML = '';
        delete lineGraphSection._lineGraphData;
        return;
    }

    // Update stored dates/labels if needed
    // (keep existing dates/labels as-is; dataset removal won't affect domain)

    // Trigger layout update
    updateLineGraphs(lineGraphSection, dataObj.svgW || lineGraphSection.clientWidth);
}

// Function to visualize line graphs
async function visualizeLineGraphs() {
    const lineGraphSection = document.getElementById('linegraph-section');

    // Clear the line graph data object when re-initializing (important when axes swap)
    delete lineGraphSection._lineGraphData;
    lineGraphSection.innerHTML = '';

    // Restore line graph height from localStorage on page reload
    const storedLineGraphHeight = parseInt(localStorage.getItem('LINEGRAPH_HEIGHT'));
    if (storedLineGraphHeight && storedLineGraphHeight > 0) {
        lineGraphSection.style.height = `${storedLineGraphHeight}px`;
    }

    // Use batch function to fetch and initialize all attributes at once
    if (ACTIVE_METADATA_MAIN.length > 0) {
        await addLineGraphAttributesBatch(ACTIVE_METADATA_MAIN);
    }
}

// Function to update line graphs on zoom
function updateLineGraphs(lineGraphSection, svgW){
    const data = lineGraphSection._lineGraphData;
    if(!data) return;
    
    // Update stored width for ruler readouts
    data.svgW = svgW;
    
    const { dates, labels, minDate, maxDate, datasets, attributeNames } = data;
    try{ console.debug('updateLineGraphs', { attributeNames, svgW, datesLen: dates?dates.length:null }); }catch(e){}

    const itemCount = Math.max(1, attributeNames.length);
    const itemHeight = lineGraphSection.clientHeight / itemCount;

    attributeNames.forEach((attrName, idx) => {
        const graphData = datasets[attrName];
        const ref = data.itemMap && data.itemMap[attrName];
        if(!ref) return;

        const svgSel = ref.svg;
        const contentG = svgSel.select('.linegraph-content');
        const pathSel = contentG.select('path.line-path');
        const rectSel = contentG.select('rect.bg-rect');

        // set viewBox and background sizes (use unscaled width; apply zoom via group transform)
        try{
            svgSel.attr('viewBox', `0 0 ${svgW} ${itemHeight}`);
            rectSel.attr('width', svgW).attr('height', itemHeight);
        }catch(e){ /* ignore */ }

        const values = graphData.map(d => d.value).filter(v => v !== null);
        if(values.length === 0) {
            pathSel.attr('d', null);
            return;
        }

        const yMin = Math.min(...values);
        const yMax = Math.max(...values);
        const yScale = d3.scaleLinear().domain([yMin, yMax]).range([itemHeight - 2, 2]);

        let x_spacings = [];
        // X scale uses overall dates/labels and zoom
        let xScale;
        if(!AXES_SWAPPED){
            x_spacings = TIME_SPACINGS || [];
            xScale = d3.scaleTime().domain([minDate, maxDate]).range([0, svgW]);
        } else {
            x_spacings = PLACE_SPACINGS || [];
            xScale = d3.scaleBand().domain(labels).range([0, svgW]).padding(0.1);
        }

        // If x_spacings is empty, create default uniform spacing
        if(x_spacings.length === 0){
            const itemCount = !AXES_SWAPPED && dates ? dates.length : (labels ? labels.length : 1);
            x_spacings = Array(itemCount + 1).fill(1);
        }

        const totalSpacing = (X_CATEGORY === 'place') ? labels.length : (dates ? dates.length : 1);
        const spacingScale = d3.scaleLinear().domain([0, totalSpacing]).range([0, svgW]);
        let cumulativePos = 0;
        const x_positions = x_spacings.map(spacing => {
            cumulativePos += spacing;
            const pos = spacingScale(cumulativePos);
            return pos;
        });

        const line = d3.line()
            .defined(d => d.value !== null)
            .x((d, i) => {
                if(!AXES_SWAPPED){
                    return x_positions[i] !== undefined ? x_positions[i] : (xScale(i) || 0);
                } else {
                    return x_positions[i] !== undefined ? x_positions[i] : (xScale(d.label));
                }
            })
            .y(d => yScale(d.value));

        // Apply transform for pan and zoom (translate then scale) to match heatmap behavior
        try{ contentG.attr('transform', `translate(${-PAN_MAIN}, 0) scale(${ZOOM_MAIN}, 1)`); }catch(e){}

        // Draw or fallback
        try{
            let dstr = null;
            try{ dstr = line(graphData);}catch(e){ dstr = null; }
            // Bind the graph data to the path then let d3 call the line generator
            pathSel.datum(graphData).attr('d', line);
        }catch(e){ console.error('Failed to update line for', attrName, e); }
    });

    // If the ruler has a recent mouse position, update red dots/readouts to track new zoom/pan
    try{
        if(window && window._updateRulerReadouts && window._lastRulerMouseX !== null){
            window._updateRulerReadouts(window._lastRulerMouseX);
        }
    }catch(e){}
}

function hideRulerReadout(){
    const chartContainer = document.getElementById('chart-container');
    const readoutsContainer = chartContainer.querySelector('.ruler-readouts');
    const dotsContainer = chartContainer.querySelector('.ruler-dots');
    if(readoutsContainer){
        readoutsContainer.style.display = 'none';
    }
    if(dotsContainer){
        dotsContainer.style.display = 'none';
    }
}

// Setup vertical time ruler across right column
(function setupTimeRuler() {
    const chartContainer = document.getElementById('chart-container');
    
    // Create UI elements using helper functions
    const ruler = createRulerLine('time-ruler');
    const readoutsContainer = createContainer('ruler-readouts', { zIndex: '10001' });
    const dotsContainer = createContainer('ruler-dots', { zIndex: '10001' });
    
    chartContainer.appendChild(ruler);
    chartContainer.appendChild(readoutsContainer);
    chartContainer.appendChild(dotsContainer);
    
    // Right column sections
    const rightColumnSections = [
        'slider-section',
        'heatmap-section',
        'x-Label-section',
        'linegraph-section'
    ];
    
    // Track last mouse X so readouts can be updated after programmatic zoom/pan
    window._lastRulerMouseX = null;
    function updateRuler(event) {
        const chartRect = chartContainer.getBoundingClientRect();
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        // remember last mouse x for programmatic updates
        window._lastRulerMouseX = mouseX;
        
        // Check if mouse is in chart container
        const isInChartContainer = mouseX >= chartRect.left && mouseX <= chartRect.right &&
                                   mouseY >= chartRect.top && mouseY <= chartRect.bottom;
        
        // Check if mouse is to the right of the first column (labels section)
        const labelsSection = document.getElementById('y-Label-section');
        const labelsSectionRight = labelsSection ? labelsSection.getBoundingClientRect().right : chartRect.left;
        const isInRightColumn = isInChartContainer && mouseX > labelsSectionRight;
        
        if(isInRightColumn) {
            ruler.style.display = 'block';
            ruler.style.left = (mouseX - chartRect.left) + 'px';
            ruler.style.top = '0px';
            ruler.style.height = chartRect.height + 'px';
            
            updateValueReadouts(mouseX);
        } else {
            ruler.style.display = 'none';
            readoutsContainer.style.display = 'none';
            dotsContainer.style.display = 'none';
            // clear last mouse position when leaving right column
            window._lastRulerMouseX = null;
        }
    }
    
    function updateValueReadouts(mouseX) {
        if(CURRENT_VIEW !== 'main') return;
        
        const lineGraphSection = document.getElementById('linegraph-section');
        const data = lineGraphSection._lineGraphData;
        if(!data) return;
        
        const { labels, dates, minDate, maxDate, attributeNames, datasets, svgW } = data;
        const datasetList = attributeNames.map(n => ({ name: n, data: datasets[n] }));
        const itemCount = Math.max(1, datasetList.length);
        const graphHeight = lineGraphSection.clientHeight / itemCount;
        
        const lineGraphRect = lineGraphSection.getBoundingClientRect();
        const relativeX = mouseX - lineGraphRect.left;
        const dataX = (relativeX + PAN_MAIN) / ZOOM_MAIN;
        
        // Rebuild x_spacings and x_positions to match updateLineGraphs
        let x_spacings = [];
        if(!AXES_SWAPPED){
            x_spacings = TIME_SPACINGS;
        } else {
            x_spacings = PLACE_SPACINGS;
        }
        
        // Convert spacing widths to cumulative positions
        const totalSpacing = (X_CATEGORY === 'place') ? ACTIVE_SITES.length : ACTIVE_DATES.length;
        const spacingScale = d3.scaleLinear().domain([0, totalSpacing]).range([0, svgW]);
        let cumulativePos = 0;
        const x_positions = x_spacings.map(spacing => {
            cumulativePos += spacing;
            const pos = spacingScale(cumulativePos);
            return pos;
        });
        
        // Find closest index based on x_positions
        let closestIdx = 0;
        let closestDist = Infinity;
        x_positions.forEach((pos, idx) => {
            const dist = Math.abs(dataX - pos);
            if(dist < closestDist) {
                closestDist = dist;
                closestIdx = idx;
            }
        });
        
        readoutsContainer.innerHTML = '';
        dotsContainer.innerHTML = '';
        window._lastRulerMouseX = mouseX;
        
        const chartRect = chartContainer.getBoundingClientRect();
        let hasValidPoints = false;
        
        datasetList.forEach((dataset, idx) => {
            const { name, data } = dataset;
            
            // Get data point at the closest index
            if(closestIdx < 0 || closestIdx >= data.length) return;
            const dataPoint = data[closestIdx];
            if(!dataPoint || dataPoint.value === null || isNaN(dataPoint.value)) return;
            
            hasValidPoints = true;
            
            // Calculate X position using x_positions array
            const pointX = x_positions[closestIdx];
            const screenX = (pointX * ZOOM_MAIN - PAN_MAIN) + lineGraphRect.left;
            
            // Calculate Y position matching updateLineGraphs y-scale
            const values = data.map(d => d.value).filter(v => v !== null);
            const yMin = Math.min(...values);
            const yMax = Math.max(...values);
            const yScale = d3.scaleLinear().domain([yMin, yMax]).range([graphHeight - 2, 2]);
            
            const graphTopY = lineGraphRect.top + (idx * graphHeight);
            const valueY = graphTopY + yScale(dataPoint.value);
            
            const { x: dotX, y: dotY } = screenToContainerCoords(screenX, valueY, chartRect);
            
            const dot = createDataDot(dotX, dotY);
            dotsContainer.appendChild(dot);
            
            // Position readout vertically centered in the graph
            const centerY = graphTopY + graphHeight / 2;
            const { x: readoutX, y: readoutY } = screenToContainerCoords(screenX, centerY, chartRect);

            const relativeX = screenX - lineGraphRect.left;
            const nearRightEdge = relativeX > lineGraphRect.width * 0.8;
            const readout = createReadout(readoutX, readoutY, `${name}: ${dataPoint.value.toFixed(3)}`, nearRightEdge);
            readoutsContainer.appendChild(readout);
        });
        
        readoutsContainer.style.display = hasValidPoints ? 'block' : 'none';
        dotsContainer.style.display = hasValidPoints ? 'block' : 'none';
    }

    // Expose readout updater for programmatic updates (zoom/pan)
    if(typeof window !== 'undefined') window._updateRulerReadouts = updateValueReadouts;
    
    function hideRuler() {
        ruler.style.display = 'none';
        readoutsContainer.style.display = 'none';
        dotsContainer.style.display = 'none';
    }
    
    // Add listeners to all right column sections
    rightColumnSections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        section.addEventListener('mousemove', updateRuler);
        section.addEventListener('mouseleave', hideRuler);
    });
})();
