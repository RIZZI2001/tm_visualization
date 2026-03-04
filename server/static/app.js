//GLOBALS:
var DATA_SETS = null;
var DATA_SET = null;
var TOPIC_SET = null;
var AXES_SWAPPED;
var CURRENT_VIEW;

var PLACE_CATEGORY;
var PLACE_INVERTED;
var PLACE_CELL_SIZES;
var PLACE_SPACINGS;
var PLACE_SPACINGS_SUM;

var TIME_CELL_SIZES;
var TIME_SPACINGS;
var TIME_SPACINGS_SUM;

let X_CATEGORY;
let Y_CATEGORY;

function updateCategories() {
    localStorage.getItem('AXES_SWAPPED') === 'true' ? AXES_SWAPPED = true : AXES_SWAPPED = false;
    if(AXES_SWAPPED){
        X_CATEGORY = 'place';
        Y_CATEGORY = 'time';
    } else {
        X_CATEGORY = 'time';
        Y_CATEGORY = 'place';
    }
}

let ACTIVE_TOPICS_MAIN = [];
let ACTIVE_METADATA_MAIN = [];
let ACTIVE_ELEMENTS_DETAIL = [];
let TOPIC_NAMES = [];
let TAXONOMY_LEVELS = [];
let TAXONOMY_DICT = {};
let ALL_SITES = [];
let ACTIVE_SITES = [];
let SITE_NAMES = [];
let SITE_COORDS = [];

let MIN_DATE = null;
let MAX_DATE = null;
let MAP_MIN_DATE = null;
let MAP_MAX_DATE = null;
let ALL_DATES = [];
let ACTIVE_DATES = [];

let HISTORY = [];

let VALUE_RANGES = {
    main: {min: 0, max: 0},
    expanded: {min: 0, max: 0},
    label: {min: 0, max: 0},
    detail_main: {min: 0, max: 0},
    detail_vertical: {min: 0, max: 0},
    detail_horizontal: {min: 0, max: 0}
};
let LEGEND_TEXT = null;

let ZOOM_MAIN = 1;
let PAN_MAIN = 0;
let xLabelWidthOnInit = null;
let yLabelHeightOnInit = null;

// Detail view zoom/pan state (independent from main view)
// Horizontal (X-axis) zoom/pan
let ZOOM_DETAIL_X = 1;
let PAN_DETAIL_X = 0;
// Vertical (Y-axis) zoom/pan
let ZOOM_DETAIL_Y = 1;
let PAN_DETAIL_Y = 0;

let DETAIL_MAP_MODE;
let MAP_DATA;
let MAP_CIRCLES = [];
let MAP_MIN_MAX = {min: 0, max: 0};
let MAP_SITE_VALUES = {}; // Store site values for quick access when updating circle sizes
let MAP_OPTIONS = {
    color: {label: 'Blue', value: '#5070c7'},
    size: 2000,
    opacity: 0.5,
    fade: false
};

let highlightCell = null; // Global highlight overlay element
let originalCellWidth = 0; // Original cell width before zoom

// Main Heatmap global references
let heatMapSection, xLabelSection, lineGraphSection, chartContainer, sliderSection;
let mainHeatmapSVG, cellsG, rowGroups, yLabelGroups;
let timelineScale, timelineG, timelineAxis, timelineDates;
let columnCount;

// Detail View global references
let detailMainHeatmapSVG = null;      // 2D heatmap in upper right cell
let detailVerticalHeatmapSVG = null;  // 1D vertical heatmap in upper left cell
let detailHorizontalHeatmapSVG = null; // 1D horizontal heatmap in bottom right cell
let detailTimelineData = null;         // Detail view timeline scale, axis, and SVG for bottom-right

let SPECS;

// Global movement handler - initialized once and reused for all views
let globalMovementHandler = null;

// Initialize the global movement handler early - works for all views
function initializeGlobalMovementHandler() {
    if (globalMovementHandler !== null) return; // Already initialized
    globalMovementHandler = initializeMovement();
}

function populatePlaceSelectDropdown(select) {
    let categories = ['site'];
    if(SITE_COORDS.some(coord => coord && coord.latitude !== undefined)) { categories.push('latitude'); categories.push('longitude'); }
    if(SITE_COORDS.some(coord => coord && coord.depth !== undefined)) { categories.push('depth'); }
    
    categories.forEach(cat => {
        [true, false].forEach(inverted => {
            const option = document.createElement('option');
            option.value = cat + ':' + inverted;
            option.textContent = cat.charAt(0).toUpperCase() + cat.slice(1) + (inverted ? ' (inv)' : '');
            select.appendChild(option);
        });
    });
    select.value = PLACE_CATEGORY + ':' + PLACE_INVERTED;
}

async function loadSitesData() {
    try {
        const payload = {
            "file": `Input/${DATA_SET}/sites.csv`,
            "data_set": `${DATA_SET}`,
            "table_type": "site",
            "specs": {
                "attribute": { "type": "list", "value": ["location_name", "rough_lat_long", "depth"]},
                "id": {
                    "type": "all",
                    "value": [],
                    "average": "false"
                }
            }
        };

        const resp = await fetchCSVData(payload);
        const rows = parseAndValidateCSV(resp.csv);
        
        SITE_NAMES = [];
        ACTIVE_SITES = [];
        
        rows.slice(1).forEach((r, idx) => {
            ACTIVE_SITES.push(idx + 1); // Sites start at ID 1
            let coords = r[1] || '';
            let depth = r[3] || '';
            if(coords.startsWith("'") && coords.endsWith("'")) {
                coords = coords.slice(1, -1);
            }
            // Parse "[lat, long]" format to {lat: <lat>, long: <long>}
            let parsedCoords = {};
            if(coords && coords !== '') {
                const coordArray = JSON.parse(coords);
                if(Array.isArray(coordArray) && coordArray.length >= 2) {
                    parsedCoords.latitude = coordArray[0];
                    parsedCoords.longitude = coordArray[1];
                    parsedCoords.siteId = idx + 1;
                }
            }
            if(depth && depth !== '') {
                parsedCoords.depth = parseFloat(depth);
            }
            SITE_COORDS.push(parsedCoords);
            let name = r[2] || 'Unnamed Site';
            // Remove surrounding quotes if present
            if(name.startsWith("'") && name.endsWith("'")) {
                name = name.slice(1, -1);
            }
            SITE_NAMES.push(name);
        });
        populatePlaceSelectDropdown(document.getElementById('place_select'));
        setPlaceSpacingAndOrder(true);
        ALL_SITES = [...ACTIVE_SITES];
        if (SPECS && Array.isArray(SPECS.defaultHiddenSites)) {
            ACTIVE_SITES = ACTIVE_SITES.filter(siteId => !SPECS.defaultHiddenSites.includes(siteId));
        }
        const storedActiveSites = JSON.parse(localStorage.getItem('ACTIVE_SITES'));
        if (Array.isArray(storedActiveSites)) {
            ACTIVE_SITES = storedActiveSites;
        }
        setPlaceSpacingAndOrder();
    } catch (e) {
        console.error('Failed to load sites data:', e);
        // Provide fallback
        SITE_NAMES = [];
        ACTIVE_SITES = [];
    }
}

async function initializeMainView(historyEntry = true) {
    CURRENT_VIEW = 'main';
    localStorage.setItem('CURRENT_VIEW', 'main');
    if(historyEntry) {
        HISTORY.push({view: 'main', elements: null, label: 'Main View'});
    }
    updateBackButtonLabel();

    document.getElementById('chart-container').style.visibility = 'visible';
    document.getElementById('detail-view-container').style.display = 'none';

    updateSliderVisibility();

    setSelectionPanelActive(document.getElementById('topic-selection-section'), true);
    setSelectionPanelActive(document.getElementById('metadata-selection-section'), true);
    setCheckboxesTo('topic', ACTIVE_TOPICS_MAIN);
    setCheckboxesTo('metadata', ACTIVE_METADATA_MAIN);
    
    await visualizeHeatMap();
    await visualizeLineGraphs();
}

(async function(){
    try{
        const dataSetsResponse = await loadDatasets();
        DATA_SETS = dataSetsResponse.data_sets || dataSetsResponse;
        SPECS = await loadFrontendSpecs();
        if(SPECS.dataSet && !DATA_SETS.includes(SPECS.dataSet)) {
            SPECS.dataSet = DATA_SETS[0];
            await fetch('/save-options', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(SPECS)
            });
        }
        TOPIC_NAMES = await loadTopicNames();
        [TAXONOMY_DICT, TAXONOMY_LEVELS] = await loadTaxonomyLevels();
        ACTIVE_METADATA_MAIN = JSON.parse(localStorage.getItem('ACTIVE_METADATA_MAIN')) || SPECS.defaultActiveMetadata;
        MIN_DATE = localStorage.getItem('MIN_DATE') || '01-01-1900';
        MAX_DATE = localStorage.getItem('MAX_DATE') || '01-01-2100';
        MAP_MIN_DATE = localStorage.getItem('MAP_MIN_DATE') || '01-01-1900';
        MAP_MAX_DATE = localStorage.getItem('MAP_MAX_DATE') || '01-01-2100';
        PLACE_CATEGORY = localStorage.getItem('PLACE_CATEGORY') || SPECS.defaultPlaceCategory;
        PLACE_INVERTED = (localStorage.getItem('PLACE_INVERTED') === 'true') || SPECS.defaultPlaceInverted || false;
        localStorage.setItem('MIN_DATE', MIN_DATE);
        localStorage.setItem('MAX_DATE', MAX_DATE);
        localStorage.setItem('MAP_MIN_DATE', MAP_MIN_DATE);
        localStorage.setItem('MAP_MAX_DATE', MAP_MAX_DATE);
        updateCategories();
        DATA_SET = SPECS.dataSet;
        TOPIC_SET = SPECS.topicSet;
        await loadSitesData();
        ALL_DATES = await loadAllDates();
        CURRENT_VIEW = localStorage.getItem('CURRENT_VIEW') || 'main';
        DETAIL_MAP_MODE = localStorage.getItem('DETAIL_MAP_MODE') === 'null' ? null : localStorage.getItem('DETAIL_MAP_MODE');
        ACTIVE_ELEMENTS_DETAIL = JSON.parse(localStorage.getItem('ACTIVE_ELEMENTS_DETAIL')) || [];

        DATA_SET = SPECS.dataSet;
        TOPIC_SET = SPECS.topicSet;
        ACTIVE_TOPICS_MAIN = JSON.parse(localStorage.getItem('ACTIVE_TOPICS_MAIN')) || Array.from({length: TOPIC_SET}, (_, i) => i);

        initializeDateRangeSlider(ALL_DATES, document.getElementById('slider-section'));

        populateMetadataSelectionPanel();
        populateSiteSelectionPanel();
        populateTopicSelectionPanel();

        heatMapSection = document.getElementById('heatmap-section');
        
        // Create global highlight cell early - works for both main and detail views
        if(!highlightCell) {
            highlightCell = document.createElement('div');
            highlightCell.id = 'cell-highlight-overlay';
            Object.assign(highlightCell.style, {
                position: 'fixed',
                pointerEvents: 'none',
                background: 'white',
                opacity: '0.28',
                zIndex: 2000,
                display: 'none'
            });
            document.body.appendChild(highlightCell);
        }

        if(CURRENT_VIEW === 'main') {
            await initializeMainView();
        } else {
            let customName = localStorage.getItem('DETAIL_VIEW_CUSTOM_NAME');
            if(!customName || customName === '' || customName === 'null') customName = null;
            await showDetailView(CURRENT_VIEW, true, ACTIVE_ELEMENTS_DETAIL, true, customName);
        }
        
    }catch(e){ console.error(e); }
})();

// Toggle axes button handler
const swapAxesBtn = document.getElementById('swap-axes-btn');
swapAxesBtn.addEventListener('click', async () => {
    AXES_SWAPPED = !AXES_SWAPPED;
    localStorage.setItem('AXES_SWAPPED', AXES_SWAPPED);
    updateCategories();
    swapAxesBtn.innerText = AXES_SWAPPED ? `switch to time` : `switch to place`;
    // Time spacing can be different if sliders are set
    setTimeSpacing();
    await initializeMainView();
});

const placeSelect = document.getElementById('place_select');
placeSelect.addEventListener('change', async () => {
    const [cat, inv] = placeSelect.value.split(':');
    PLACE_CATEGORY = cat;
    PLACE_INVERTED = (inv === 'true');
    localStorage.setItem('PLACE_CATEGORY', PLACE_CATEGORY);
    localStorage.setItem('PLACE_INVERTED', PLACE_INVERTED);
    setPlaceSpacingAndOrder();
    initializeMainView();
});

const mainViewButton = document.getElementById('main-view-btn');
const backBtn = document.getElementById('back-btn');
backBtn.addEventListener('click', async () => {
    if(HISTORY.length >= 2){
        HISTORY.pop();
        const previousState = HISTORY[HISTORY.length - 1];
        if(previousState.view === 'main'){
            await initializeMainView(false);
            mainViewButton.style.visibility = 'hidden';
        } else {
            await showDetailView(previousState.view, true, previousState.elements, false, previousState.label);
        }
        updateBackButtonLabel();
    } else {
        if(CURRENT_VIEW === 'main') return; // Already at main view
        await initializeMainView(true);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    // Initialize global movement handler first (independent of which view loads)
    initializeGlobalMovementHandler();
    
    mainViewButton.addEventListener('click', () => {
        initializeMainView();
        mainViewButton.style.visibility = 'hidden';
    });
});

function updateBackButtonLabel() {
    if(HISTORY.length >= 2) {
        backBtn.style.display = 'inline-block';
        backBtn.textContent = '← ' + HISTORY[HISTORY.length - 2].label;
    } else {
        backBtn.style.display = 'none';
    }
}