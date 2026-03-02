// ============================================================================
// Detail View for Topic Analysis
// ============================================================================

// Store reference to movement handler to pause it when detail view is shown
let heatmapMovementHandler = null;

// Store reference to the blur listener so we can remove it
let detailTitleBlurListener = null;
let detailTitleKeydownListener = null;

let BC_DATABASE = null; // Global cache for bar chart taxonomy info
let BC_COLOR_KEY_COL = null; // Global cache for bar chart color key category
let BC_COLORS = {}; // Global cache for bar chart colors

let metadataCorrelationContainer, topicCorrelationContainer, otuCorrelationContainer, compositionContainer
let metadataCorrelationTitle, topicCorrelationTitle, otuCorrelationTitle, compositionTitle

async function showDetailView(detailType, setCheckBoxes, activeElements, historyEntry = true, customTitle = null) {
    const chartContainer = document.getElementById('chart-container');
    const detailViewContainer = document.getElementById('detail-view-container');
    const detailTitle = document.getElementById('detail-title');
    const detailLeftContent = document.getElementById('detail-left-content');
    const mainViewButton = document.getElementById('main-view-btn');

    mainViewButton.style.visibility = 'visible';
    hideRulerReadout();

    //Deactivate selection sections
    if(detailType !== 'topic') {
        setSelectionPanelActive(document.getElementById('topic-selection-section'), false);
    } else {
        setSelectionPanelActive(document.getElementById('topic-selection-section'), true);
    }
    if(detailType !== 'metadata') {
        setSelectionPanelActive(document.getElementById('metadata-selection-section'), false);
    } else {
        setSelectionPanelActive(document.getElementById('metadata-selection-section'), true);
    }

    CURRENT_VIEW = detailType;
    ACTIVE_ELEMENTS_DETAIL = activeElements;
    let label = '';
    if(detailType === 'topic') {
        label = activeElements.map(id => nameOfTopic(id)).join(', ');
    } else if(detailType === 'metadata' || detailType === 'otu') {
        label = activeElements.join(', ');
        label = label.charAt(0).toUpperCase() + label.slice(1);
    }
    // Update title with topic ID(s)
    localStorage.setItem('DETAIL_VIEW_CUSTOM_NAME', customTitle);
    const titleText = customTitle || label;

    if(historyEntry) {
        HISTORY.push({view: detailType, elements: [...activeElements], label: titleText + ''});
    }
    updateBackButtonLabel();

    // Store in browser cache
    localStorage.setItem('CURRENT_VIEW', CURRENT_VIEW);
    localStorage.setItem('ACTIVE_ELEMENTS_DETAIL', JSON.stringify(ACTIVE_ELEMENTS_DETAIL));

    if(setCheckBoxes && (detailType === 'topic' || detailType === 'metadata')) {setCheckboxesTo(detailType, ACTIVE_ELEMENTS_DETAIL);}

    detailTitle.textContent = titleText;

    if(detailType === 'topic' && ACTIVE_ELEMENTS_DETAIL.length == 1) {
        detailTitle.contentEditable = "true";
        detailTitle.classList.add('editable-title');
    } else {
        detailTitle.contentEditable = "false";
        detailTitle.classList.remove('editable-title');
    }
    
    // Remove old event listeners if they exist
    if (detailTitleBlurListener) {
        detailTitle.removeEventListener('blur', detailTitleBlurListener);
    }
    if (detailTitleKeydownListener) {
        detailTitle.removeEventListener('keydown', detailTitleKeydownListener);
    }
    
    // Create and attach new blur listener with current topicId
    if(detailType === 'topic' && ACTIVE_ELEMENTS_DETAIL.length == 1) {
        setupTopicRename(detailTitle, titleText);
    }
    
    detailLeftContent.innerHTML = '';
    
    if(detailType === 'topic') {
        await populateCorrelationBarChart('md_top', 'Metadata', detailLeftContent);
        await populateCorrelationBarChart('top_top', 'Topic', detailLeftContent);
    } else if (detailType === 'otu') {
        // Find the taxonomy path for the selected item
        const searchItem = customTitle || (activeElements.length > 0 ? activeElements[0] : null);
        if (searchItem) {
            const taxonomyPath = findTaxonomyPath(TAXONOMY_DICT, searchItem);
            if(taxonomyPath && taxonomyPath.length < TAXONOMY_LEVELS.length){
                detailTitle.textContent += ' (' + TAXONOMY_LEVELS[taxonomyPath.length - 1] + ')';
            }

            if (taxonomyPath && taxonomyPath.length > 0) {
                const taxonomyHeader = document.createElement('h3');
                taxonomyHeader.className = 'barchart-header';
                taxonomyHeader.textContent = 'Taxonomy';
                detailLeftContent.appendChild(taxonomyHeader);
                
                const taxonomyContainer = document.createElement('div');
                taxonomyContainer.className = 'taxonomy-scroll-container';
                
                // Display taxonomy data in transposed format (headers on left, values on right)
                const taxonomyTable = document.createElement('table');
                
                // For each taxonomy level in TAXONOMY_LEVELS, create a row with level | value pair
                // Skip the last element as it's the displayed element itself
                for (let colIdx = 0; colIdx < taxonomyPath.length - 1; colIdx++) {
                    const transposedRow = document.createElement('tr');
                    
                    // Header cell (taxonomy level name)
                    const headerCell = document.createElement('td');
                    headerCell.textContent = TAXONOMY_LEVELS[colIdx] || `Level ${colIdx}`;
                    
                    // Value cell (taxonomy value) - make it a button
                    const valueCell = document.createElement('td');
                    const valueButton = document.createElement('button');
                    valueButton.textContent = taxonomyPath[colIdx];
                    valueButton.className = 'taxonomy-value-button';
                    valueButton.addEventListener('click', () => {
                        const subPath = taxonomyPath.slice(0, colIdx + 1);
                        const otus = generateOTUList(subPath);
                        showDetailView('otu', false, otus, true, valueCell.textContent);
                    });
                    valueCell.appendChild(valueButton);
                    
                    transposedRow.appendChild(headerCell);
                    transposedRow.appendChild(valueCell);
                    taxonomyTable.appendChild(transposedRow);
                }
                
                taxonomyContainer.appendChild(taxonomyTable);
                detailLeftContent.appendChild(taxonomyContainer);
                
                // Display direct sub-elements from TAXONOMY_DICT
                let nodeRef = TAXONOMY_DICT;
                for (let i = 0; i < taxonomyPath.length; i++) {
                    nodeRef = nodeRef[taxonomyPath[i]];
                    if (!nodeRef) break;
                }
                
                if (nodeRef && typeof nodeRef === 'object' && Object.keys(nodeRef).length > 0) {
                    const subElementsHeader = document.createElement('h4');
                    subElementsHeader.className = 'barchart-sub-header';
                    subElementsHeader.textContent = 'Sub-elements: ' + (TAXONOMY_LEVELS[taxonomyPath.length] || 'Sub-elements');
                    detailLeftContent.appendChild(subElementsHeader);
                    
                    const subElementsContainer = document.createElement('div');
                    subElementsContainer.className = 'taxonomy-scroll-container subelements-scroll';
                    
                    // Create table for sub-elements
                    const subElementsTable = document.createElement('table');
                    
                    // Create a row for each sub-element
                    Object.keys(nodeRef).forEach(subElement => {
                        const subElementRow = document.createElement('tr');
                        
                        // Create cell with sub-element button
                        const subElementCell = document.createElement('td');
                        const subElementButton = document.createElement('button');
                        subElementButton.textContent = subElement;
                        subElementButton.className = 'taxonomy-value-button';
                        subElementButton.addEventListener('click', () => {
                            const subPath = [...taxonomyPath, subElement];
                            const otus = generateOTUList(subPath);
                            showDetailView('otu', false, otus, true, subElement);
                        });
                        subElementCell.appendChild(subElementButton);
                        subElementRow.appendChild(subElementCell);
                        subElementsTable.appendChild(subElementRow);
                    });
                    
                    subElementsContainer.appendChild(subElementsTable);
                    detailLeftContent.appendChild(subElementsContainer);
                }
            }
        }
        await populateCorrelationBarChart('md_otu', 'Metadata', detailLeftContent);
    } else if (detailType === 'metadata') {
        await populateCorrelationBarChart('md_md', 'Metadata', detailLeftContent);
        await populateCorrelationBarChart('md_top', 'Topic', detailLeftContent);
        await populateCorrelationBarChart('md_otu', 'OTU', detailLeftContent);
    }

    if(detailType !== 'metadata') {
        await fetchRankValues();
        if(detailType === 'topic') generateBarColors();

        if(compositionContainer || compositionTitle) {
            compositionContainer.remove();
            compositionTitle.remove();
        }

        compositionTitle = document.createElement('h3');
        compositionTitle.className = 'barchart-header';
        compositionTitle.textContent = (detailType === 'topic') ? 'OTU Composition' : 'Topic Composition';
        detailLeftContent.appendChild(compositionTitle);

        compositionContainer = document.createElement('div');
        compositionContainer.className = 'barchart-scroll-container';
        detailLeftContent.appendChild(compositionContainer);

        populateCompositionBarChart(compositionContainer);
    }

    chartContainer.style.visibility = 'hidden';
    detailViewContainer.style.display = 'flex';
    
    if(DETAIL_MAP_MODE === null) {    
        await createDetailViewGrid();
    } else {
        await openMap();
    }
}

function setupTopicRename(detailTitle, titleText) {
    detailTitleBlurListener = () => {
        const topicId = ACTIVE_ELEMENTS_DETAIL[0];
        let newName = detailTitle.textContent.trim();
        if(newName === '' || newName === `Topic ${topicId}`) {
            newName = `Topic ${topicId}`;
            detailTitle.textContent = newName;
            // Remove custom name locally and on server
            delete TOPIC_NAMES[TOPIC_SET][topicId];
            updateTopicName(topicId, newName)
            // Call server to delete the name
            const params = new URLSearchParams({
                dataSet: DATA_SET,
                topicSet: TOPIC_SET,
                topicID: String(topicId),
                topicName: '',
                renameThreshold: SPECS.automaticItscRenameThreshold
            });
            postAndFetchTopicName(params);
        }else if (newName !== titleText) {
            // Add custom name locally and on server
            // Initialize topic set object if it doesn't exist
            titleText = newName; // Update titleText variable to newName
            if (!TOPIC_NAMES[TOPIC_SET]) {
                TOPIC_NAMES[TOPIC_SET] = {};
            }
            TOPIC_NAMES[TOPIC_SET][topicId] = newName;
            updateTopicName(topicId, newName);
            // Call server to set the new name
            const params = new URLSearchParams({
                dataSet: DATA_SET,
                topicSet: TOPIC_SET,
                topicID: String(topicId),
                topicName: newName,
                renameThreshold: SPECS.automaticItscRename ? SPECS.automaticItscRenameThreshold : 2 // Set to 2 to effectively disable automatic renaming of intersecting topics when a custom name is set
            });
            postAndFetchTopicName(params);
        }
        HISTORY[HISTORY.length - 1].label = newName + '';
    };
    
    detailTitle.addEventListener('blur', detailTitleBlurListener);
    
    // Create and attach new keydown listener with current topicId
    detailTitleKeydownListener = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            detailTitle.blur();
        }
    };
    
    detailTitle.addEventListener('keydown', detailTitleKeydownListener);
}

function generateBarColors() {
    BC_COLOR_KEY_COL = 3;
    let uniqueValues;
    let uniqueCount = 1;
    // Find first column with more than 1 unique value to differentiate items by color
    while (uniqueCount <= 1) {
        const values = BC_DATABASE.slice(1).map(row => row[BC_COLOR_KEY_COL]);
        
        uniqueValues = new Set(values);
        uniqueCount = uniqueValues.size;
        BC_COLOR_KEY_COL += 1;
    }
    BC_COLOR_KEY_COL -= 1; // Step back to last checked column
    
    // Generate color dict for the uniqueValues. Generate them pseudo random hues. brightness and saturation are allways maxed.
    uniqueCount = uniqueValues.size; // Update uniqueCount to match actual set size
    let idx = 0;
    uniqueValues.forEach((val) => {
        const hue = Math.floor((idx/uniqueCount) * 360);
        BC_COLORS[val] = `hsl(${hue}, 60%, 40%)`;
        idx++;
    });
}

async function openMap() {
    const legendContainer = document.getElementById('legend-container');
    legendContainer.style.display = 'none';
    const container = document.getElementById('detail-right-panel');
    container.innerHTML = '';    
    const mapHeader = document.createElement('div');
    mapHeader.className = 'map-header';

    const exitButton = document.createElement('button');
    exitButton.className = 'map-exit-btn header-btn';
    exitButton.style.width = '100px';
    exitButton.textContent = 'Exit Map';
    exitButton.addEventListener('click', () => {
        DETAIL_MAP_MODE = null;
        localStorage.setItem('DETAIL_MAP_MODE', DETAIL_MAP_MODE);
        createDetailViewGrid();
    });
    mapHeader.appendChild(exitButton);

    const timeSliderSection = document.createElement('div');
    timeSliderSection.className = 'map-time-slider-section';

    const timeSliderContainer = document.createElement('div');
    timeSliderContainer.className = 'map-time-slider-container';

    const switchSliderModeButton = document.createElement('button');
    switchSliderModeButton.className = 'map-switch-slider-mode-btn header-btn';
    switchSliderModeButton.textContent = DETAIL_MAP_MODE === 'range' ? 'Single' : 'Range';
    switchSliderModeButton.addEventListener('click', () => {
        DETAIL_MAP_MODE = (DETAIL_MAP_MODE === 'range') ? 'single' : 'range';
        localStorage.setItem('DETAIL_MAP_MODE', DETAIL_MAP_MODE);
        timeSliderContainer.innerHTML = '';
        switchSliderModeButton.textContent = DETAIL_MAP_MODE === 'range' ? 'Single' : 'Range';
        initializeDateRangeSlider(ACTIVE_DATES, timeSliderContainer, 'detail', DETAIL_MAP_MODE === 'single');
    });
    timeSliderSection.appendChild(switchSliderModeButton);
    timeSliderSection.appendChild(timeSliderContainer);

    mapHeader.appendChild(timeSliderSection);

    container.appendChild(mapHeader);

    // Create map container
    const mapContainer = document.createElement('div');
    mapContainer.id = 'detail-map';
    mapContainer.style.cssText = `
        width: 100%;
        height: calc(100% - 52px);
        position: relative;
    `;
    container.appendChild(mapContainer);
    const detailPayload = JSON.parse(JSON.stringify(detailViewBasePayload()));
    MAP_DATA = await fetchCSVData(detailPayload);
    MAP_DATA =  parseAndValidateCSV(MAP_DATA.csv);
    //Replace first column with formatted dates
    MAP_DATA = [MAP_DATA[0], ...MAP_DATA.slice(1).map(row => [formatDate(row[0]), ...row.slice(1)])];
    //find minimum and maximum values in the data for scaling the circles
    let minValue = Infinity, maxValue = -Infinity;
    for (let i = 1; i < MAP_DATA.length; i++) {
        for (let j = 1; j < MAP_DATA[i].length; j++) {
            const value = parseFloat(MAP_DATA[i][j]);
            if (!isNaN(value)) {
                if (value < minValue) minValue = value;
                if (value > maxValue) maxValue = value;
            }
        }
    }
    MAP_MIN_MAX = {min: minValue, max: maxValue};
    ACTIVE_DATES = MAP_DATA.slice(1).map(row => row[0]);
    initializeDateRangeSlider(ACTIVE_DATES, timeSliderContainer, 'detail', DETAIL_MAP_MODE === 'single');

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload = () => initializeMap();
    document.head.appendChild(script);
}

function detailTimeSliderChanged() {
    localStorage.setItem('MAP_MIN_DATE', MAP_MIN_DATE);
    localStorage.setItem('MAP_MAX_DATE', MAP_MAX_DATE);
    const activeDateSet = new Set(ACTIVE_DATES.slice(ACTIVE_DATES.indexOf(MAP_MIN_DATE), ACTIVE_DATES.indexOf(MAP_MAX_DATE) + 1));
    const mapDataSlice = [MAP_DATA[0], ...MAP_DATA.slice(1).filter(row => activeDateSet.has(formatDate(row[0])))];
    MAP_CIRCLES.forEach(circle => {
        const siteId = circle.siteId;
        const siteColIdx = MAP_DATA[0].indexOf(`${siteId}`);
        if (siteColIdx !== -1) {
            const validValues = [];
            mapDataSlice.slice(1).forEach(row => {
                const value = parseFloat(row[siteColIdx]);
                if (!isNaN(value)) {
                    validValues.push(value);
                }
            });
            
            const siteValue = validValues.length > 0 ? validValues.reduce((sum, val) => sum + val, 0) / validValues.length : null;
            MAP_SITE_VALUES[siteId] = siteValue; // Store the average value for this site
            const radius = MAP_OPTIONS.size * (siteValue - MAP_MIN_MAX.min) / (MAP_MIN_MAX.max - MAP_MIN_MAX.min);
            circle.setRadius(radius);
            if(siteValue == null) {
                circle.marker.setStyle({ fillColor: '#5e5e5e' });
            } else {
                circle.marker.setStyle({ fillColor: MAP_OPTIONS.color.value });
            }
        }
    });
    return;
}

// Function to update circle colors when color or opacity changes
function updateMapCircleColors() {
    MAP_CIRCLES.forEach(circle => {
        if (circle.gradientId) {
            const gradient = document.getElementById(circle.gradientId);
            if (gradient) {
                const stops = gradient.querySelectorAll('stop');
                stops[0].setAttribute('stop-color', MAP_OPTIONS.color.value);
                stops[1].setAttribute('stop-color', MAP_OPTIONS.color.value);
                circle.setStyle({ fillOpacity: MAP_OPTIONS.opacity });
            }
        }
    });
}

async function initializeMap() {
    MAP_OPTIONS = JSON.parse(localStorage.getItem('MAP_OPTIONS')) || MAP_OPTIONS;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;

    ACTIVE_SITES.forEach(siteId => {
        const siteData = SITE_COORDS.find(item => item.siteId === siteId);
        // Update min/max lat/long
        if (siteData.latitude < minLat) minLat = siteData.latitude;
        if (siteData.latitude > maxLat) maxLat = siteData.latitude;
        if (siteData.longitude < minLng) minLng = siteData.longitude;
        if (siteData.longitude > maxLng) maxLng = siteData.longitude;
    });

    // Initialize map
    const map = L.map('detail-map').fitBounds([[minLat, minLng], [maxLat, maxLng]]);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Create SVG with radial gradients
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElement.setAttribute('width', '0');
    svgElement.setAttribute('height', '0');
    svgElement.style.position = 'absolute';
    svgElement.style.pointerEvents = 'none';
    
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svgElement.appendChild(defs);
    document.body.appendChild(svgElement);

    // Function to create or update radial gradient
    function createRadialGradient(color, gradientId) {
        let gradient = document.getElementById(gradientId);
        if (!gradient) {
            gradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
            gradient.setAttribute('id', gradientId);
            gradient.setAttribute('cx', '50%');
            gradient.setAttribute('cy', '50%');
            gradient.setAttribute('r', '50%');
            
            const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop1.setAttribute('offset', '0%');
            stop1.setAttribute('stop-color', color);
            stop1.setAttribute('stop-opacity', '1');
            
            const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop2.setAttribute('offset', '100%');
            stop2.setAttribute('stop-color', color);
            stop2.setAttribute('stop-opacity', '0');
            
            gradient.appendChild(stop1);
            gradient.appendChild(stop2);
            defs.appendChild(gradient);
        } else {
            // Update existing gradient colors
            const stops = gradient.querySelectorAll('stop');
            stops[0].setAttribute('stop-color', color);
            stops[1].setAttribute('stop-color', color);
        }
    }

    MAP_CIRCLES = [];
    // Add markers for each active site
    ACTIVE_SITES.forEach(siteId => {
        const siteData = SITE_COORDS.find(item => item.siteId === siteId);
        if (siteData) {
            const siteName = SPECS.showPlaceNameLabels 
                ? (SITE_NAMES[siteId] || siteId)
                : siteId;
            let lat = siteData.latitude.toFixed(4);
            lat = lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`;
            let lng = siteData.longitude.toFixed(4);
            lng = lng > 0 ? `${lng}°E` : `${Math.abs(lng)}°W`;
            
            // Create radial gradient for this site if fade is enabled
            let circleColor = MAP_OPTIONS.color.value;
            let gradientId = null;
            
            if (MAP_OPTIONS.fade) {
                gradientId = `gradient-${siteId}`;
                createRadialGradient(MAP_OPTIONS.color.value, gradientId);
                circleColor = `url(#${gradientId})`;
            }
            
            const circle = L.circle([siteData.latitude, siteData.longitude], 1000, {
                fillColor: circleColor,
                fillOpacity: MAP_OPTIONS.opacity,
                weight: 0,
            }).addTo(map);
            //add siteId as property to circle for later reference
            circle.siteId = siteId;
            circle.gradientId = gradientId;
            const marker = L.circleMarker([siteData.latitude, siteData.longitude], {
                radius: 8,
                fillColor: MAP_OPTIONS.color.value,
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: MAP_OPTIONS.opacity,
                pane: 'shadowPane'
            })
            .bindPopup(`<strong>${siteName}</strong><br>[${lat}, ${lng}]<br>Value: ${getValueForSite(siteId)}`)
            .addTo(map);
            marker.on('popupopen', function() {
                marker.setPopupContent(`<strong>${siteName}</strong><br>[${lat}, ${lng}]<br>Value: ${getValueForSite(siteId)}`);
            });
            circle.marker = marker; // Link marker to circle for easy access when updating popup content
            MAP_CIRCLES.push(circle);
        }
    });

    function getValueForSite(siteId) {
        const value = MAP_SITE_VALUES[siteId];
        return (value !== undefined && value !== null) ? value.toFixed(2) : 'N/A';
    }

    detailTimeSliderChanged();
    // Trigger map resize to ensure it renders properly
    window.setTimeout(() => {
        map.invalidateSize();
    }, 100);

    // Create map options container in top right corner
    const detailRightPanel = document.getElementById('detail-right-panel');
    if (detailRightPanel && !detailRightPanel.querySelector('#map-options-container')) {
        const optionsContainer = document.createElement('div');
        optionsContainer.id = 'map-options-container';
        
        // Color select
        const colorLabel = document.createElement('label');
        colorLabel.textContent = 'Color:';
        colorLabel.className = 'map-options-label';
        optionsContainer.appendChild(colorLabel);
        
        const colorSelect = document.createElement('select');
        colorSelect.className = 'map-options-select';
        
        const colors = [
            { label: 'Blue', value: '#5070c7' },
            { label: 'Petrol', value: '#216381' },
            { label: 'Green', value: '#298641' },
            { label: 'Orange', value: '#f08903' },
            { label: 'Red', value: '#e94040' },
            { label: 'Purple', value: '#9a49e6' },
            { label: 'Black', value: '#000000' },
            { label: 'White', value: '#e4e4e4' }
        ];
        
        colors.forEach(color => {
            const option = document.createElement('option');
            option.value = JSON.stringify(color);
            option.textContent = color.label;
            option.style.color = color.value;
            option.style.backgroundColor = '#fff';
            option.style.fontWeight = 'bold';
            colorSelect.appendChild(option);
        });
        optionsContainer.appendChild(colorSelect);
        colorSelect.value = JSON.stringify(MAP_OPTIONS.color);

        colorSelect.addEventListener('change', () => {
            MAP_OPTIONS.color = JSON.parse(colorSelect.value);
            MAP_CIRCLES.forEach(circle => {
                if (circle.gradientId) {
                    const gradient = document.getElementById(circle.gradientId);
                    if (gradient) {
                        const stops = gradient.querySelectorAll('stop');
                        stops[0].setAttribute('stop-color', MAP_OPTIONS.color.value);
                        stops[1].setAttribute('stop-color', MAP_OPTIONS.color.value);
                    }
                } else {
                    circle.setStyle({ fillColor: MAP_OPTIONS.color.value });
                }
                circle.marker.setStyle({ fillColor: MAP_OPTIONS.color.value });
            });
            localStorage.setItem('MAP_OPTIONS', JSON.stringify(MAP_OPTIONS));
        });

        // Circle size label
        const sizeLabel = document.createElement('label');
        sizeLabel.textContent = 'Circle size';
        sizeLabel.className = 'map-options-label';
        optionsContainer.appendChild(sizeLabel);
        
        // Circle size controls
        const sizeControlsContainer = document.createElement('div');
        sizeControlsContainer.style.cssText = 'display: flex; gap: 5px; align-items: center;';
        
        const decreaseBtn = document.createElement('button');
        decreaseBtn.textContent = '−';
        decreaseBtn.className = 'map-options-btn';
        decreaseBtn.style.cssText = 'flex: 1; padding: 5px;';

        decreaseBtn.addEventListener('click', () => {
            MAP_OPTIONS.size = MAP_OPTIONS.size * 0.9;
            MAP_CIRCLES.forEach(circle => {
                circle.setRadius(MAP_OPTIONS.size);
            });
            localStorage.setItem('MAP_OPTIONS', JSON.stringify(MAP_OPTIONS));
            detailTimeSliderChanged(); // Re-apply slider changes to adjust circle sizes based on new base size
        });

        const increaseBtn = document.createElement('button');
        increaseBtn.textContent = '+';
        increaseBtn.className = 'map-options-btn';
        increaseBtn.style.cssText = 'flex: 1; padding: 5px;';

        increaseBtn.addEventListener('click', () => {
            MAP_OPTIONS.size = MAP_OPTIONS.size / 0.9;
            MAP_CIRCLES.forEach(circle => {
                circle.setRadius(MAP_OPTIONS.size);
            });
            localStorage.setItem('MAP_OPTIONS', JSON.stringify(MAP_OPTIONS));
            detailTimeSliderChanged(); // Re-apply slider changes to adjust circle sizes based on new base size
        });
        
        sizeControlsContainer.appendChild(decreaseBtn);
        sizeControlsContainer.appendChild(increaseBtn);
        optionsContainer.appendChild(sizeControlsContainer);
        
        // Opacity slider
        const opacityLabel = document.createElement('label');
        opacityLabel.textContent = 'Opacity';
        opacityLabel.className = 'map-options-label';
        optionsContainer.appendChild(opacityLabel);
        
        const opacitySlider = document.createElement('input');
        opacitySlider.type = 'range';
        opacitySlider.min = '0.1';
        opacitySlider.max = '1';
        opacitySlider.step = '0.1';
        opacitySlider.value = MAP_OPTIONS.opacity;
        opacitySlider.className = 'map-options-slider';
        optionsContainer.appendChild(opacitySlider);

        opacitySlider.addEventListener('input', () => {
            MAP_OPTIONS.opacity = parseFloat(opacitySlider.value);
            MAP_CIRCLES.forEach(circle => {
                circle.setStyle({ fillOpacity: MAP_OPTIONS.opacity });
            });
            localStorage.setItem('MAP_OPTIONS', JSON.stringify(MAP_OPTIONS));
        });
        
        // Fade toggle
        const fadeLabel = document.createElement('label');
        fadeLabel.textContent = 'Fade';
        fadeLabel.className = 'map-options-label';
        optionsContainer.appendChild(fadeLabel);
        
        const fadeToggle = document.createElement('input');
        fadeToggle.type = 'checkbox';
        fadeToggle.checked = MAP_OPTIONS.fade;
        fadeToggle.className = 'map-options-checkbox';
        fadeToggle.style.cssText = 'width: auto; cursor: pointer;';
        optionsContainer.appendChild(fadeToggle);
        
        fadeToggle.addEventListener('change', () => {
            MAP_OPTIONS.fade = fadeToggle.checked;
            localStorage.setItem('MAP_OPTIONS', JSON.stringify(MAP_OPTIONS));
            // Reload the map to apply the fade change
            openMap();
        });
        
        detailRightPanel.style.position = 'relative';
        detailRightPanel.appendChild(optionsContainer);
    }
}

/**
 * Create a 2x2 grid layout in the detail right panel
 * Grid layout: 20% / 80% horizontal, 80% / 20% vertical
 * Top left: vertical heatmap (averaged data), Top right: mini heatmap (detail data)
 * Bottom left: empty, Bottom right: horizontal row (averaged data)
 * @param {HTMLElement} container - The detail right panel container
 * @param {number} topicId - The topic ID to display
 */
async function createDetailViewGrid() {
    const legendContainer = document.getElementById('legend-container');
    legendContainer.style.display = 'block';
    ZOOM_DETAIL_X = 1;
    PAN_DETAIL_X = 0;
    ZOOM_DETAIL_Y = 1;
    PAN_DETAIL_Y = 0;
    const container = document.getElementById('detail-right-panel');
    container.innerHTML = '';
    
    // Create grid wrapper
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'detail-grid-wrapper';
    
    // Cell 1: Top-left (20% x 80%) - vertical heatmap
    const cellTopLeft = document.createElement('div');
    cellTopLeft.className = 'detail-grid-cell detail-cell-top-left';
    cellTopLeft.id = 'detail-vertical-heatmap-cell';
    
    // Cell 2: Top-right (80% x 80%) - mini heatmap
    const cellTopRight = document.createElement('div');
    cellTopRight.className = 'detail-grid-cell detail-cell-top-right';
    cellTopRight.id = 'detail-mini-heatmap-cell';
    
    // Cell 3: Bottom-left (20% x 20%) - options dropdown, swap axes button, and map button
    const cellBottomLeft = document.createElement('div');
    cellBottomLeft.className = 'detail-grid-cell detail-cell-bottom-left';
    
    // Create options dropdown
    const optionsDropdown = document.createElement('select');
    optionsDropdown.className = 'detail-options-dropdown';
    
    populatePlaceSelectDropdown(optionsDropdown);
    
    optionsDropdown.addEventListener('change', (e) => {
        const [cat, inv] = optionsDropdown.value.split(':');
        PLACE_CATEGORY = cat;
        PLACE_INVERTED = (inv === 'true');
        localStorage.setItem('PLACE_CATEGORY', PLACE_CATEGORY);
        localStorage.setItem('PLACE_INVERTED', PLACE_INVERTED);
        setPlaceSpacingAndOrder();
        createDetailViewGrid();
    });
    
    cellBottomLeft.appendChild(optionsDropdown);
    
    // Create buttons row container
    const buttonsRow = document.createElement('div');
    buttonsRow.className = 'detail-buttons-row';
    
    // Create map button
    const mapButton = document.createElement('button');
    mapButton.className = 'detail-map-btn';
    mapButton.textContent = 'Map';
    
    mapButton.addEventListener('click', () => {
        DETAIL_MAP_MODE = 'range';
        localStorage.setItem('DETAIL_MAP_MODE', DETAIL_MAP_MODE);
        openMap();
    });
    
    buttonsRow.appendChild(mapButton);
    
    // Create swap axes button
    const swapAxesButton = document.createElement('button');
    swapAxesButton.className = 'detail-swap-axes-btn';
    swapAxesButton.textContent = 'Swap Axes';
    
    swapAxesButton.addEventListener('click', () => {
        // Clean up old detail movement handler before recreating grid
        if (detailMovementHandler && typeof detailMovementHandler.cleanup === 'function') {
            detailMovementHandler.cleanup();
            detailMovementHandler = null;
        }
        
        // Reset zoom and pan before swapping axes
        ZOOM_DETAIL_X = 1;
        PAN_DETAIL_X = 0;
        ZOOM_DETAIL_Y = 1;
        PAN_DETAIL_Y = 0;
        
        AXES_SWAPPED = !AXES_SWAPPED;
        localStorage.setItem('AXES_SWAPPED', AXES_SWAPPED);
        updateCategories();
        createDetailViewGrid();
    });
    
    buttonsRow.appendChild(swapAxesButton);
    cellBottomLeft.appendChild(buttonsRow);
    
    // Cell 4: Bottom-right (80% x 20%) - horizontal row
    const cellBottomRight = document.createElement('div');
    cellBottomRight.className = 'detail-grid-cell detail-cell-bottom-right';
    cellBottomRight.id = 'detail-horizontal-hm-cell';
    
    gridWrapper.appendChild(cellTopLeft);
    gridWrapper.appendChild(cellTopRight);
    gridWrapper.appendChild(cellBottomLeft);
    gridWrapper.appendChild(cellBottomRight);
    
    container.appendChild(gridWrapper);

    try {
        const basePayload = detailViewBasePayload();

        // Fetch detail data (mini heatmap) - full Place x Time data
        const detailPayload = JSON.parse(JSON.stringify(basePayload));
        detailPayload.specs.sample.average = "false";
        
        // Fetch averaged over time (vertical heatmap) - Place data only
        const verticalPayload = JSON.parse(JSON.stringify(basePayload));
        verticalPayload.specs.sample.average = !AXES_SWAPPED ? "time" : "place";
        
        // Fetch averaged over place (horizontal row) - Time data only
        const horizontalPayload = JSON.parse(JSON.stringify(basePayload));
        horizontalPayload.specs.sample.average = !AXES_SWAPPED ? "place" : "time";

        // Fetch all three datasets
        const [detailResp, verticalResp, horizontalResp] = await Promise.all([
            fetchCSVData(detailPayload),
            fetchCSVData(verticalPayload),
            fetchCSVData(horizontalPayload)
        ]);

        // Render detail heatmap (top right) - 2D full data
        if (detailResp && detailResp.csv) {
            const result = parseAndRenderHeatmap(detailResp.csv, cellTopRight, 'main');
            detailMainHeatmapSVG = result.svg;
            LEGEND_TEXT = createLegend(result.valueRange.min, result.valueRange.max);
            VALUE_RANGES.detail_main = result.valueRange;
        }

        // Render vertical heatmap (top left) - averaged data as 1D with Y labels
        if (verticalResp && verticalResp.csv) {
            const result = parseAndRenderHeatmap(verticalResp.csv, cellTopLeft, 'vertical');
            detailVerticalHeatmapSVG = result.svg;
            const {labels, colors} = result;
            createDetailViewLabels(cellTopLeft, labels, 'vertical', colors);
            VALUE_RANGES.detail_vertical = result.valueRange;
        }

        // Render horizontal row (bottom right) - averaged data as 1D with X labels
        if (horizontalResp && horizontalResp.csv) {
            const result = parseAndRenderHeatmap(horizontalResp.csv, cellBottomRight, 'horizontal');
            detailHorizontalHeatmapSVG = result.svg;
            const {labels, colors} = result;
            createDetailViewLabels(cellBottomRight, labels, 'horizontal', colors);
            VALUE_RANGES.detail_horizontal = result.valueRange;
        }
        
        // Initialize detail movement handler for zoom/pan
        if (typeof initializeDetailMovementHandler === 'function') {
            initializeDetailMovementHandler();
            if (detailMovementHandler && typeof detailMovementHandler.init === 'function') {
                detailMovementHandler.init();
            }
        }

    } catch (error) {
        console.error('Error creating detail view grid:', error);
    }
}

function createDetailViewLabels(cellElement, labels, direction, colors) {
    // Create container div for labels (no SVG to avoid scaling issues)
    const labelContainer = document.createElement('div');
    labelContainer.style.position = 'absolute';
    labelContainer.style.top = '0';
    labelContainer.style.left = '0';
    labelContainer.style.width = '100%';
    labelContainer.style.height = '100%';
    labelContainer.style.zIndex = '5';
    labelContainer.style.pointerEvents = 'none';
    labelContainer.style.overflow = 'hidden';

    if(direction === 'vertical') {
        const totalHeight = cellElement.clientHeight;
        const cellHeight = totalHeight / labels.length;
        const widthC = cellElement.clientWidth;

        if (AXES_SWAPPED) {
            // Very weird behaviour! The vertical timeline here needs to be inverted as opposed to one in the main view
            const verticalTimeline = createTimeline(labels, widthC, totalHeight, true, true);
            const timelineSvg = verticalTimeline.svg.node();
            labelContainer.appendChild(timelineSvg);
            // Move only the timeline-content g element to the right
            
            verticalTimeline.g.attr('transform', `translate(${widthC}, 0)`);
            
            // Store vertical timeline reference globally for zoom/pan updates
            window.detailVerticalTimelineData = {
                scale: verticalTimeline.scale,
                axis: verticalTimeline.axis,
                g: d3.select(timelineSvg).select('.timeline-content'),
                svg: timelineSvg,
                timelineX: widthC,
                minDate: verticalTimeline.minDate,
                maxDate: verticalTimeline.maxDate
            };
            
            // Watch for cell resizing and update timeline scale
            const resizeObserver = new ResizeObserver(() => {
                const currentHeight = cellElement.clientHeight;
                const currentWidth = cellElement.clientWidth;
                if (currentHeight <= 0 || !totalHeight) return;
                
                // Update timelineX position when width changes
                if (currentWidth !== window.detailVerticalTimelineData.timelineX) {
                    window.detailVerticalTimelineData.timelineX = currentWidth;
                    verticalTimeline.g.attr('transform', `translate(${currentWidth}, 0)`);
                }
                
                // Update scale range to match new container height
                const scale = verticalTimeline.scale;
                scale.range([currentHeight, 0]); // Inverted for vertical
                
                // Redraw axis with new scale
                const timelineG = d3.select(timelineSvg).select('.timeline-content');
                timelineG.call(verticalTimeline.axis);
            });
            
            resizeObserver.observe(cellElement);
        } else {
            // Show place labels using percentages so they scale with window resize
            if(SPECS.showPlaceNameLabels) {
                labels = ACTIVE_SITES.map(siteId => {
                    return SITE_NAMES[siteId - 1] || `s${siteId}`;
                });
            }

            // Apply custom cell sizes for place labels if applicable
            let accHeight = 0;
            labels.forEach((label, idx) => {
                const customCellHeight = cellHeight * (Y_CATEGORY === 'place' && (labels.length > 1) ? (PLACE_CELL_SIZES[idx] || 1) : 1);
                const labelEl = document.createElement('div');
                const topPercent = (accHeight / totalHeight) * 100;
                const heightPercent = (customCellHeight / totalHeight) * 100;
                const textColor = hexToLightness(colors[idx]) > 40 ? '#000000' : '#ffffff';
                const fontSize = Math.max(9, Math.min(customCellHeight * 0.4, 14));
                
                labelEl.style.position = 'absolute';
                labelEl.style.left = '5px';
                labelEl.style.top = topPercent + '%';
                labelEl.style.height = heightPercent + '%';
                labelEl.style.fontSize = fontSize + 'px';
                labelEl.style.color = textColor;
                labelEl.style.whiteSpace = 'nowrap';
                labelEl.style.overflow = 'hidden';
                labelEl.style.textOverflow = 'ellipsis';
                labelEl.style.display = 'flex';
                labelEl.style.alignItems = 'center';
                labelEl.textContent = label;
                labelContainer.appendChild(labelEl);
                accHeight += customCellHeight;
            });

            // Add vertical coordinate scale if applicable
            let vertCoordScale = null;
            let vertCoordScaleSvg = null;
            let vertCoordScaleContainer = null;
            
            if((PLACE_CATEGORY === 'latitude' || PLACE_CATEGORY === 'longitude') && SPECS.scaleCellsByDistance) {
                // Create separate positioned container for vertical coordinate scale (at left, 30px wide)
                vertCoordScaleContainer = document.createElement('div');
                vertCoordScaleContainer.style.position = 'absolute';
                vertCoordScaleContainer.style.top = '0';
                vertCoordScaleContainer.style.left = '0';
                vertCoordScaleContainer.style.width = '100%';
                vertCoordScaleContainer.style.height = '100%';
                vertCoordScaleContainer.style.zIndex = '10';
                vertCoordScaleContainer.style.pointerEvents = 'auto';
                vertCoordScaleContainer.style.overflow = 'hidden';
                
                cellElement.appendChild(vertCoordScaleContainer);
                
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

                vertCoordScale = createCoordScale(extendedStart, extendedEnd, widthC, totalHeight, true, true);
                vertCoordScaleSvg = vertCoordScale.svg.node();
                vertCoordScaleContainer.appendChild(vertCoordScaleSvg);

                vertCoordScale.g.attr('transform', `translate(${widthC}, 0)`);
                
                // Store vertical coordinate scale reference globally for zoom/pan updates
                window.detailVerticalCoordScaleData = {
                    scale: vertCoordScale.scale,
                    axis: vertCoordScale.axis,
                    g: d3.select(vertCoordScaleSvg).select('.coordScale-content'),
                    svg: vertCoordScaleSvg,
                    timelineX: widthC
                };

                const resizeObserverVert = new ResizeObserver(() => {
                    const currentHeight = cellElement.clientHeight;
                    const currentWidth = cellElement.clientWidth;
                    if (currentHeight <= 0 || !totalHeight) return;
                    
                    // Update timelineX position when width changes
                    if (currentWidth !== window.detailVerticalCoordScaleData.timelineX) {
                        window.detailVerticalCoordScaleData.timelineX = currentWidth;
                        vertCoordScale.g.attr('transform', `translate(${currentWidth}, 0)`);
                    }
                    
                    // Update scale range to match new container height
                    const scale = vertCoordScale.scale;
                    scale.range([currentHeight, 0]); // Inverted for vertical
                    
                    // Redraw axis with new scale
                    const coordScaleG = d3.select(vertCoordScaleSvg).select('.coordScale-content');
                    coordScaleG.call(vertCoordScale.axis);
                });
                
                resizeObserverVert.observe(cellElement);
            }
        }
        
        // Ensure cellElement can have absolute children
        cellElement.style.position = 'relative';
        cellElement.appendChild(labelContainer);
    } else {
        //Horizontal labels
        const totalWidth = cellElement.clientWidth;
        
        if (AXES_SWAPPED) {
            // Show label boxes (place labels) using createLabelBoxes with 'detail' prefix
            const labelBoxes = createLabelBoxes(labels, totalWidth, cellElement.clientHeight, 'detail', colors);
            labelContainer.appendChild(labelBoxes.svg.node());
            
            let horiCoordScale = null;
            let coordScaleSvg = null;
            let coordScaleContainer = null;
            
            if((PLACE_CATEGORY === 'latitude' || PLACE_CATEGORY === 'longitude') && SPECS.scaleCellsByDistance) {
                // Create separate positioned container for coordinate scale (at top)
                coordScaleContainer = document.createElement('div');
                coordScaleContainer.style.position = 'absolute';
                coordScaleContainer.style.top = '0';
                coordScaleContainer.style.left = '0';
                coordScaleContainer.style.width = '100%';
                coordScaleContainer.style.height = '30px';
                coordScaleContainer.style.zIndex = '10';
                coordScaleContainer.style.pointerEvents = 'auto';
                coordScaleContainer.style.overflow = 'hidden';
                
                labelContainer.appendChild(coordScaleContainer);
                
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

                horiCoordScale = createCoordScale(extendedStart, extendedEnd, totalWidth, 30, false);
                coordScaleSvg = horiCoordScale.svg.node();
                coordScaleSvg.style.position = 'absolute';
                coordScaleSvg.style.width = '100%';
                coordScaleSvg.style.height = '100%';
                coordScaleContainer.appendChild(coordScaleSvg);
                
                // Store coordScale reference globally for zoom/pan updates
                window.detailCoordScaleData = {
                    scale: horiCoordScale.scale,
                    axis: horiCoordScale.axis,
                    g: d3.select(coordScaleSvg).select('.coordScale-content'),
                    svg: coordScaleSvg
                };
            }
            
            // Watch for cell resizing and update label boxes AND coordinate scale
            const resizeObserver = new ResizeObserver(() => {
                const currentWidth = cellElement.clientWidth;
                const currentHeight = cellElement.clientHeight;
                
                // Update coordinate scale if it exists
                if (horiCoordScale && coordScaleSvg) {
                    const scale = horiCoordScale.scale;
                    scale.range([0, currentWidth]);
                    
                    // Redraw axis with new scale
                    const coordScaleG = d3.select(coordScaleSvg).select('.coordScale-content');
                    coordScaleG.call(horiCoordScale.axis);
                }
                
                // Recalculate and update label boxes
                const labelBoxesParent = labelBoxes.svg.node().parentElement;
                if (labelBoxesParent) {
                    labelBoxes.svg.node().remove();
                    const newLabelBoxes = createLabelBoxes(labels, currentWidth, currentHeight, 'detail', colors);
                    labelBoxesParent.appendChild(newLabelBoxes.svg.node());
                }
            });
            
            resizeObserver.observe(cellElement);
        } else {
            const horizontalTimeline = createTimeline(labels, totalWidth, 100, false);
            const timelineSvg = horizontalTimeline.svg.node();
            labelContainer.appendChild(timelineSvg);
            
            // Store timeline reference globally for zoom/pan updates
            window.detailTimelineData = {
                scale: horizontalTimeline.scale,
                axis: horizontalTimeline.axis,
                g: d3.select(timelineSvg).select('.timeline-content'),
                svg: timelineSvg,
                minDate: horizontalTimeline.minDate,
                maxDate: horizontalTimeline.maxDate
            };
            
            // Watch for cell resizing and update timeline scale
            const resizeObserver = new ResizeObserver(() => {
                const currentWidth = cellElement.clientWidth;
                if (currentWidth <= 0 || !totalWidth) return;
                
                // Update scale range to match new container width
                const scale = horizontalTimeline.scale;
                scale.range([0, currentWidth]);
                
                // Redraw axis with new scale
                const timelineG = d3.select(timelineSvg).select('.timeline-content');
                timelineG.call(horizontalTimeline.axis);
            });
            
            resizeObserver.observe(cellElement);
        }
        
        // Ensure cellElement can have absolute children
        cellElement.style.position = 'relative';
        cellElement.appendChild(labelContainer);
    }
}

async function fetchCorrelationValues(correlationType) {
    let filePath = `Output/${DATA_SET}/Correlation/${correlationType}/${TOPIC_SET}_${correlationType}_correlation.csv`;
    if(correlationType === 'md_md' || correlationType === 'md_otu') {
        filePath = `Output/${DATA_SET}/Correlation/${correlationType}_correlation.csv`;
    }
    let attribute = {
        "type": "list",
        "value": SPECS.metadataOptions
    };
    let id = {
        "type": "all"
    };
    let otu = {
        "type": "list",
        "prefix": "",
        "value": ACTIVE_ELEMENTS_DETAIL,
        "average": "true"
    };
    if(CURRENT_VIEW === 'metadata') {
        attribute = {
            "type": "list",
            "value": ACTIVE_ELEMENTS_DETAIL,
            "average": "true"
        };
        otu = {
            "type": "all"
        };
    } else if (CURRENT_VIEW === 'topic') {
        id = {
            "type": "list",
            "value": ACTIVE_ELEMENTS_DETAIL,
            "average": "true"
        };
    }
    try {
        const payload = {
            "file": filePath,
            "data_set": `${DATA_SET}`,
            "table_type": correlationType,
            "specs": {
                "id": id,
                "otu": otu,
                "attribute": attribute
            }
        };
        const response = await fetchCSVData(payload);
        const responseData = parseAndValidateCSV(response.csv);
        //console.log(`Correlation data for ${correlationType}:`, payload, responseData);
        return responseData;
    } catch (error) {
        console.error('Error fetching correlation values:', error);
    }
}

/**
 * Fetch taxonomy information for specified OTUs
 * @param {Array<string>} otuNames - Array of OTU names to fetch taxonomy for
 * @returns {Promise<Array>} 2D array with taxonomy data, first row is header, subsequent rows are OTU data
 */
async function fetchTaxonomy(otuNames) {
    try {
        const payload = {
            "file": `Input/${DATA_SET}/taxonomy.csv`,
            "data_set": `${DATA_SET}`,
            "table_type": "taxonomy",
            "specs": {
                "otu": {
                    "type": "list",
                    "prefix": "",
                    "value": otuNames
                },
                "attribute": {
                    "type": "list",
                    "value": TAXONOMY_LEVELS
                }
            }
        };
        const taxonomyResponse = await fetchCSVData(payload);
        const rows = parseAndValidateCSV(taxonomyResponse.csv);
        return rows;
    } catch (error) {
        console.error('Error fetching taxonomy:', error);
        return [];
    }
}

async function fetchRankValues() {
    try {
        let specs;
        if (CURRENT_VIEW === 'topic') {
            specs = {
                "otu": {
                    "type": "all",
                    "prefix": `otu_${DATA_SET}_`,
                    "value": []
                },
                "id": {
                    "type": "list",
                    "value": ACTIVE_ELEMENTS_DETAIL,
                    "average": "true"
                }
            };
        } else if (CURRENT_VIEW === 'otu') {
            specs = {
                "otu": {
                    "type": "list",
                    "prefix": "",
                    "value": ACTIVE_ELEMENTS_DETAIL,
                    "average": "true"
                },
                "id": {
                    "type": "all",
                    "value": [],
                    "average": "false"
                }
            };
        }
        // Create payload for OTU data fetch
        const payload = {
            "file": `Output/${DATA_SET}/TM_Components/${TOPIC_SET}_components.csv`,
            "data_set": `${DATA_SET}`,
            "table_type": "component",
            "specs": specs
        };

        const response = await fetchCSVData(payload);
        
        // Parse the CSV response and sort by value (highest first)
        let rows = parseAndValidateCSV(response.csv);
        if (CURRENT_VIEW === 'otu') rows = transpose(rows);
        const BC_Data = {};
        
        // CSV structure: row[0] has kind(OTU) names, row[1] has values
        // Skip first column (Unnamed: 0) which contains category(topic) name
        const BC_names = rows[0].slice(1);
        const BC_values = rows[1].slice(1);
        
        // Pair names with their values
        for (let i = 0; i < BC_names.length; i++) {
            const BC_name = BC_names[i];
            const BC_value = parseFloat(BC_values[i]);
            if (!isNaN(BC_value)) {
                BC_Data[BC_name] = BC_value;
            }
        }
        
        // Sort by value (highest first) - return as array of [name, value] pairs to maintain sort order
        const sortedBC = Object.entries(BC_Data).sort((a, b) => b[1] - a[1]);
        sortedBC.splice(SPECS.barchartItems);
        sortedBC.unshift(['name', 'value']);
        BC_DATABASE = sortedBC;

        if(CURRENT_VIEW === 'topic') {
            const otuNames = sortedBC.slice(1).map(([name, _]) => name);
            const taxonomyRows = await fetchTaxonomy(otuNames);
            if (taxonomyRows && taxonomyRows.length >= 2) {
                const taxonomyHeader = taxonomyRows[0];
                
                const taxonomyMap = {};
                for (let rowIdx = 1; rowIdx < taxonomyRows.length; rowIdx++) {
                    const otuName = taxonomyRows[rowIdx][0];
                    taxonomyMap[otuName] = taxonomyRows[rowIdx];
                }
                
                const mergedHeader = [BC_DATABASE[0][0], BC_DATABASE[0][1], ...taxonomyHeader.slice(1)];
                BC_DATABASE[0] = mergedHeader;
                for (let i = 1; i < BC_DATABASE.length; i++) {
                    const otuName = BC_DATABASE[i][0];
                    const taxonomyRow = taxonomyMap[otuName];
                    
                    if (taxonomyRow) {
                        BC_DATABASE[i] = [BC_DATABASE[i][0], BC_DATABASE[i][1], ...taxonomyRow.slice(1)];
                    }
                }
            }
        } else {
            return;
        }
    } catch (error) {
        console.error('Error fetching OTU values:', error);
    }
}

/**
 * Populate the metadata section with a bar chart of correlation data
 * @param {HTMLElement} container - The container to populate
 * @param {Array} correlationData - Array of correlation data, first row is header, others are [name, value] pairs
 */
async function populateCorrelationBarChart(correlationType, title, detailLeftContent) {
    correlationData = await fetchCorrelationValues(correlationType);
    if (correlationData[0].length > 2) {
        correlationData = transpose(correlationData);
    }

    const correlationHeader = document.createElement('h3');
    correlationHeader.className = 'barchart-header';
    correlationHeader.textContent = title + ' Correlation';
    const container = document.createElement('div');
    container.className = 'correlation-scroll-container';

    //Ensure no duplicate charts for the same type exist
    if (title === 'OTU') {
        if (otuCorrelationContainer) otuCorrelationContainer.remove();
        if (otuCorrelationTitle) otuCorrelationTitle.remove();
        otuCorrelationContainer = container;
        otuCorrelationTitle = correlationHeader;
    } else if (title === 'Metadata') {
        if (metadataCorrelationContainer) metadataCorrelationContainer.remove();
        if (metadataCorrelationTitle) metadataCorrelationTitle.remove();
        metadataCorrelationContainer = container;
        metadataCorrelationTitle = correlationHeader;
    } else if (title === 'Topic') {
        if (topicCorrelationContainer) topicCorrelationContainer.remove();
        if (topicCorrelationTitle) topicCorrelationTitle.remove();
        topicCorrelationContainer = container;
        topicCorrelationTitle = correlationHeader;
    }

    detailLeftContent.appendChild(correlationHeader);
    detailLeftContent.appendChild(container);

    if (!correlationData || correlationData.length < 2) {
        container.innerHTML = '<div style="padding: 10px; color: #999;">No data available</div>';
        return;
    }

    if(correlationType === 'md_otu' && CURRENT_VIEW === 'metadata') {
        correlationData = generateGroupedOTUValues(correlationData);
    }
    
    // Extract items from correlationData (skip header in first row)
    let dataItems = correlationData.slice(1).map(row => ({
        label: title === 'Topic' ? nameOfTopic(row[0]) : row[0],
        value: parseFloat(row[1]),
        raw_label: row[0]
    }));
    
    // Sort by value if SPECS.sort_correlations is true
    if (SPECS.sortCorrelations) {
        dataItems.sort((a, b) => b.value - a.value);
    }
    
    // Track which bar's tooltip is currently shown
    let currentTooltipBar = null;
    
    // Create bar items
    dataItems.forEach((item) => {
        if(ACTIVE_ELEMENTS_DETAIL.includes(item.raw_label)) return; // Skip active elements
        if(ACTIVE_ELEMENTS_DETAIL.includes(parseInt(item.raw_label))) return;
        const barItem = document.createElement('div');
        barItem.className = 'correlation-bar-item';
        
        // Create container for the bidirectional bar (scaled from -1 to 1)
        const barContainer = document.createElement('div');
        barContainer.className = 'bar-container';
        
        // Left half (for negative values, right-aligned)
        const leftHalf = document.createElement('div');
        leftHalf.className = 'bar-left-half';
        
        // Create left side (negative values)
        const leftBar = document.createElement('div');
        leftBar.className = 'bar-left-bar';
        const negativeWidth = item.value < 0 ? Math.abs(item.value) * 100 : 0;
        leftBar.style.width = `${negativeWidth}%`;
        leftHalf.appendChild(leftBar);
        
        // Right half (for positive values, left-aligned)
        const rightHalf = document.createElement('div');
        rightHalf.className = 'bar-right-half';
        
        // Create right side (positive values)
        const rightBar = document.createElement('div');
        rightBar.className = 'bar-right-bar';
        const positiveWidth = item.value > 0 ? item.value * 100 : 0;
        rightBar.style.width = `${positiveWidth}%`;
        rightHalf.appendChild(rightBar);
        
        barContainer.appendChild(leftHalf);
        barContainer.appendChild(rightHalf);
        
        // Create label (overlay on top, positioned absolutely)
        const label = document.createElement('span');
        label.className = 'bar-label';
        label.textContent = item.label;
        
        barItem.appendChild(barContainer);
        barItem.appendChild(label);
        
        // Store the value as a data attribute
        barItem.dataset.value = item.value;
        
        let hoverTimeout = null;
        let isHovering = false;
        
        barItem.addEventListener('mouseenter', () => {
            isHovering = true;
            
            if (currentTooltipBar !== item.label) {
                if (hoverTimeout !== null) {
                    clearTimeout(hoverTimeout);
                }
                currentTooltipBar = item.label;
                showMetadataTooltip(item, barItem);
            }
        });
        
        barItem.addEventListener('mouseleave', () => {
            isHovering = false;
            if (hoverTimeout !== null) {
                clearTimeout(hoverTimeout);
                hoverTimeout = null;
            }
            if (currentTooltipBar === item.label) {
                currentTooltipBar = null;
                hideBCTooltip();
            }
        });
        
        barItem.addEventListener('click', () => {
            if(title === 'Topic') {
                showDetailView('topic', true, [parseInt(item.raw_label)]);   
            } else if (title === 'Metadata') {
                showDetailView('metadata', true, [item.raw_label]);
            } else if (title === 'OTU') {
                const otus = generateOTUList(findTaxonomyPath(TAXONOMY_DICT, item.raw_label));
                showDetailView('otu', false, otus, true, item.label);
            }
        });
        
        container.appendChild(barItem);
    });
    
    // Hide tooltip when mouse leaves the entire container
    container.addEventListener('mouseleave', () => {
        if (currentTooltipBar !== null) {
            currentTooltipBar = null;
            hideBCTooltip();
        }
    });
}

function detailViewBasePayload() {
    let tableType = 'topic';
    let filePath = `Output/${DATA_SET}/TM_Topics/${TOPIC_SET}_topics.csv`;
    let spec_value = {
        "type": "list",
        "value": ACTIVE_ELEMENTS_DETAIL,
        "average": "true"
    };
    if (CURRENT_VIEW === 'otu') {
        tableType = 'otu';
        filePath = `Input/${DATA_SET}/otus.csv`;
        spec_value = {
            "type": "list",
            "prefix": "",
            "value": ACTIVE_ELEMENTS_DETAIL,
            "average": "true"
        };
    }
    if (CURRENT_VIEW === 'metadata') {
        tableType = 'metadata';
        filePath = `Input/${DATA_SET}/metadata.csv`;
    }

    let spec_key;
    if (CURRENT_VIEW === 'otu') {
        spec_key = 'otu';
    } else if (CURRENT_VIEW === 'topic') {
        spec_key = 'id';
    } else if (CURRENT_VIEW === 'metadata') {
        spec_key = 'attribute';
    }

    return {
        "file": filePath,
        "data_set": `${DATA_SET}`,
        "table_type": tableType,
        "specs": {
            "sample": generateSampleSpec(),
            [spec_key]: spec_value
        }
    };
}

function showMetadataTooltip(item, barElement) {
    const tooltip = getHeatmapTooltip();
    const content = `<strong>${item.label}</strong><br><strong>Correlation:</strong> ${item.value.toFixed(3)}`;
    tooltip.html(content).style('display', 'block');
    
    const barRect = barElement.getBoundingClientRect();
    const tooltipWidth = tooltip.node().offsetWidth;
    
    const nearRightEdge = barRect.right + tooltipWidth + 5 > window.innerWidth * 0.95;
    const leftPos = nearRightEdge 
        ? (barRect.left - tooltipWidth - 5) + 'px'
        : (barRect.right + 5) + 'px';
    
    tooltip.style('left', leftPos).style('top', (barRect.top + barRect.height / 2 - tooltip.node().offsetHeight / 2) + 'px');
}

/**
 * Populate the left panel with a bar chart of items
 * @param {HTMLElement} container - The container to populate
 * @param {Array} sortedBC - Sorted array of [otuName, value] pairs
 */
function populateCompositionBarChart(container) {    
    // If no OTUs provided, show empty state
    if (BC_DATABASE.length === 0) {
        container.innerHTML = '<div style="padding: 10px; color: #999;">No OTU data available</div>';
        return;
    }
    
    // Convert to items format with names as labels
    const items = BC_DATABASE.slice(1).map(([BC_name, BC_value]) => ({
        label: BC_name,
        value: BC_value
    }));
    
    // Use first value as max for scaling
    const maxValue = items[0].value;
    
    // Track which bar's tooltip is currently shown
    let currentTooltipBar = null;
    
    // Create bar items
    items.forEach((item, idx) => {
        const barItem = document.createElement('div');
        barItem.style.cssText = `
            display: flex;
            align-items: center;
            height: 30px;
            background-color: black;
            cursor: pointer;
            transition: background-color 0.2s;
            position: relative;
            `;
            
            // Calculate bar width based on value
            const barWidth = (item.value / maxValue) * 100;
            
            // Create the actual bar (no label inside)
            const bar = document.createElement('div');
            bar.style.cssText = `
                width: ${barWidth}%;
                height: 100%;
                transition: background-color 0.2s;
            `;
            if(CURRENT_VIEW === 'otu') {
                bar.style.backgroundColor = 'var(--bar)';
            } else {
                const color = BC_COLORS[BC_DATABASE[idx+1][BC_COLOR_KEY_COL]];
                const colorDark = color.replace(/(\d+)%\)/, '10%)');
                bar.style.backgroundColor = color;
                barItem.style.backgroundColor = colorDark;
            }
            
            // Create label (overlay on top of the bar, positioned absolutely)
            const label = document.createElement('span');
            if(CURRENT_VIEW === 'otu') {
                label.textContent = nameOfTopic(item.label);
            } else {
                label.textContent = item.label;
            }
            label.style.cssText = `
                font-size: 16px;
                color: var(--text-light);
                white-space: nowrap;
                padding-left: 8px;
                position: absolute;
                left: 0;
                top: 0;
                height: 100%;
                display: flex;
                align-items: center;
                pointer-events: none;
                z-index: 10;
            `;
            
            barItem.appendChild(bar);
            barItem.appendChild(label);
            
            // Store the value as a data attribute
            barItem.dataset.value = item.value;
            
            let hoverTimeout = null;
            let isHovering = false;
            
            barItem.addEventListener('mouseenter', () => {
                isHovering = true;
                
                if (currentTooltipBar !== item.label) {
                    if (hoverTimeout !== null) {
                        clearTimeout(hoverTimeout);
                    }
                    currentTooltipBar = item.label;
                    showBCTooltip(item.label, barItem);
                }
            });
            
            barItem.addEventListener('mouseleave', () => {
                isHovering = false;
                if (hoverTimeout !== null) {
                    clearTimeout(hoverTimeout);
                    hoverTimeout = null;
                }
                if (currentTooltipBar === item.label) {
                    currentTooltipBar = null;
                    hideBCTooltip();
                }
            });
            
            barItem.addEventListener('click', () => {
                if(CURRENT_VIEW === 'topic') {
                    const taxonomyPath = BC_DATABASE.find(row => row[0] === item.label).slice(2).filter(t => t !== '');
                    showDetailView('otu', false, [item.label]);
                } else {
                    showDetailView('topic', true, [parseInt(item.label)]);
                }
            });
            
            container.appendChild(barItem);
        });
    
    // Hide tooltip when mouse leaves the entire container
    container.addEventListener('mouseleave', () => {
        if (currentTooltipBar !== null) {
            currentTooltipBar = null;
            hideBCTooltip();
        }
    });
}

function showBCTooltip(itemName, barElement) {
    const tooltip = getHeatmapTooltip();
    let content = '';
    if(CURRENT_VIEW === 'otu') {
        content += `<strong>${nameOfTopic(itemName)}</strong><br>`;
    } else {
        content += `<strong>${itemName}</strong><br>`;
    }
    const BC_id = BC_DATABASE.findIndex(entry => entry[0] === itemName);
    for (let i = 1; i < BC_DATABASE[0].length; i++) {
        content += `<strong>${BC_DATABASE[0][i]}:</strong> ${BC_DATABASE[BC_id][i]}<br>`;
    }
    tooltip.html(content).style('display', 'block');
    
    const barRect = barElement.getBoundingClientRect();
    const tooltipWidth = tooltip.node().offsetWidth;
    
    const nearRightEdge = barRect.right + tooltipWidth + 5 > window.innerWidth * 0.95;
    const leftPos = nearRightEdge 
        ? (barRect.left - tooltipWidth - 5) + 'px'
        : (barRect.right + 5) + 'px';
    
    tooltip.style('left', leftPos).style('top', (barRect.top + barRect.height / 2 - tooltip.node().offsetHeight / 2) + 'px');
}

function hideBCTooltip() {
    getHeatmapTooltip().style('display', 'none');
}

/**
 * Find the path to a taxonomy item in the TAXONOMY_DICT tree
 * @param {Object} node - Current node in the tree
 * @param {string} searchItem - Item name to find
 * @param {Array} currentPath - Current path being built
 * @returns {Array|null} Path to the item, or null if not found
 */
function findTaxonomyPath(node, searchItem, currentPath = []) {
    // Check if any key at this level matches the search item
    for (const key of Object.keys(node)) {
        if (key === searchItem) {
            return [...currentPath, key];
        }
        
        // Recursively search in children
        const childNode = node[key];
        if (typeof childNode === 'object' && childNode !== null && Object.keys(childNode).length > 0) {
            const result = findTaxonomyPath(childNode, searchItem, [...currentPath, key]);
            if (result) {
                return result;
            }
        }
    }
    
    return null;
}