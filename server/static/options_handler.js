// ============================================================================
// Options Handler
// ============================================================================

let optionsOverlay = null;
let optionsData = {};

const optionsTabs = {
    Data: ['dataSet', 'topicSet', 'metadataOptions', 'customSiteOrder', 'timeRange', 'placeCategories', 'excludedSites'],
    UI: ['scaleCellsByDistance', 'showPlaceNameLabels', 'sortCorrelations', 'fetchDelayExpandedRow', 'barchartItems', 'maxZoom', 'zoomSpeed'],
    Coloring: ['topicColorScale', 'topicColorScaleType', 'metadataColorScale', 'metadataColorScaleType', 'otuColorScale', 'otuColorScaleType', 'invertColorScale'],
    Defaults: ['defaultPlaceCategory', 'defaultPlaceInverted', 'defaultHiddenSites', 'defaultActiveMetadata', 'automaticItscRename', 'automaticItscRenameThreshold',],
    Reset: []
};

/**
 * Initialize options handler and attach listener to options button
 */
function initOptionsHandler() {
    const optionsBtn = document.getElementById('options-btn');
    if (optionsBtn) {
        optionsBtn.addEventListener('click', showOptionsOverlay);
    }
}

/**
 * Fetch and display the options overlay
 */
async function showOptionsOverlay() {
    try {
        // Fetch frontend-specs.json with cache-busting to get latest version
        const response = await fetch('./frontend-specs.json?t=' + Date.now());
        optionsData = await response.json();
        
        // Create and show overlay
        createOptionsOverlay();
    } catch (error) {
        console.error('Error loading frontend specs:', error);
    }
}

/**
 * Create the options overlay window
 */
function createOptionsOverlay() {
    // Create tab navigation
    const tabNav = document.createElement('div');
    tabNav.className = 'options-tabs';
    
    // Create content area
    const content = document.createElement('div');
    content.className = 'options-content';
    
    const tabGroups = {};
    
    // Create groups for each tab defined in optionsTabs
    for (const tabName of Object.keys(optionsTabs)) {
        const group = document.createElement('div');
        group.className = 'option-group';
        group.id = `tab-group-${tabName.toLowerCase()}`;
        content.appendChild(group);
        tabGroups[tabName] = group;
        
        // Create tab button
        const tabBtn = document.createElement('button');
        tabBtn.className = 'options-tab-btn';
        tabBtn.textContent = tabName;
        tabBtn.dataset.tab = tabName;
        tabBtn.addEventListener('click', () => switchOptionsTab(tabName));
        tabNav.appendChild(tabBtn);
    }
    
    // Create "Other" group for anything not in the tabs
    const otherGroup = document.createElement('div');
    otherGroup.className = 'option-group';
    otherGroup.id = 'tab-group-other';
    content.appendChild(otherGroup);
    
    // Populate options into their respective groups
    for (const [key, value] of Object.entries(optionsData)) {
        let targetGroup = otherGroup;
        
        // Find which tab this key belongs to
        for (const [tabName, keys] of Object.entries(optionsTabs)) {
            if (keys.includes(key)) {
                targetGroup = tabGroups[tabName];
                break;
            }
        }
        
        const optionItem = createOptionItem(key, value);
        targetGroup.appendChild(optionItem);
    }
    
    // If "Other" group is empty, remove it
    if (otherGroup.children.length > 0) {
        const otherBtn = document.createElement('button');
        otherBtn.className = 'options-tab-btn';
        otherBtn.textContent = 'Other';
        otherBtn.dataset.tab = 'Other';
        otherBtn.addEventListener('click', () => switchOptionsTab('Other'));
        tabNav.appendChild(otherBtn);
        tabGroups['Other'] = otherGroup;
    } else {
        otherGroup.remove();
    }
    
    // Add Reset buttons to the Reset tab
    const resetOptions = [
        { text: 'Reset Options', action: () => saveAndReloadOptions({}), message: 'Are you sure you want to reset all options to defaults?' },
        { text: 'Reset topic names for Topicset', action: () => resetTopicNames('#resetTopicSet'), message: 'Are you sure you want to reset topic names for the current topicset?' },
        { text: 'Reset topic names for Dataset', action: () => resetTopicNames('#resetDataSet'), message: 'Are you sure you want to reset topic names for the current dataset?' },
        { text: 'Reset all topic names', action: () => resetTopicNames('#resetAll'), message: 'Are you sure you want to reset all topic names?' }
    ];
    
    resetOptions.forEach(opt => {
        const container = document.createElement('div');
        container.className = 'option-item';
        
        const btn = document.createElement('button');
        btn.className = 'options-save-btn';
        btn.textContent = opt.text;
        btn.addEventListener('click', () => {
            if (confirm(opt.message)) {
                opt.action();
            }
        });
        
        container.appendChild(btn);
        tabGroups['Reset'].appendChild(container);
    });
    
    // Create footer with Save & Reload button
    const footer = document.createElement('div');
    footer.className = 'options-footer';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'options-save-btn';
    saveBtn.textContent = 'Save & Reload';
    saveBtn.addEventListener('click', () => saveAndReloadOptions(optionsData));
    
    footer.appendChild(saveBtn);
    
    // Combine nav and content
    const wrapper = document.createElement('div');
    wrapper.className = 'options-wrapper';
    wrapper.appendChild(tabNav);
    wrapper.appendChild(content);
    
    optionsOverlay = createOverlay('options-overlay', 'Options', wrapper, footer, closeOptionsOverlay, null, '800px');
    document.body.appendChild(optionsOverlay);
    
    // Activate first tab
    const firstTab = Object.keys(tabGroups).find(tab => tabGroups[tab].children.length > 0) || Object.keys(tabGroups)[0];
    if (firstTab) {
        switchOptionsTab(firstTab);
    }
}

/**
 * Switch between options tabs
 */
function switchOptionsTab(tabName) {
    // Update buttons
    const buttons = document.querySelectorAll('.options-tab-btn');
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update groups
    const groups = document.querySelectorAll('.option-group');
    groups.forEach(group => {
        group.classList.toggle('active', group.id === `tab-group-${tabName.toLowerCase()}`);
    });
}

/**
 * Create individual option item based on value type
 */
function createOptionItem(key, value) {
    const item = document.createElement('div');
    item.className = 'option-item';
    
    const label = document.createElement('label');
    label.className = 'option-label';
    label.textContent = formatKeyName(key);
    
    let inputElement;
    
    if (typeof value === 'boolean') {
        // Checkbox for boolean
        inputElement = document.createElement('input');
        inputElement.type = 'checkbox';
        inputElement.className = 'option-input option-checkbox';
        inputElement.checked = value;
        inputElement.dataset.key = key;
        inputElement.addEventListener('change', (e) => updateOption(key, e.target.checked));
    } else if (key === 'topicColorScale' || key === 'metadataColorScale' || key === 'otuColorScale') {
        // Dropdown for colorScale
        inputElement = document.createElement('select');
        inputElement.className = 'option-input option-select';
        inputElement.dataset.key = key;
        
        const colorScales = ['Viridis','Inferno','Plasma','Cool','Warm','Turbo','CubehelixDefault','Green','Purple','Red','Blue'];
        colorScales.forEach(scale => {
            const option = document.createElement('option');
            option.value = scale;
            option.textContent = scale;
            option.selected = (scale === value);
            inputElement.appendChild(option);
        });
        
        inputElement.addEventListener('change', (e) => updateOption(key, e.target.value));
    } else if (key === 'topicColorScaleType' || key === 'metadataColorScaleType' || key === 'otuColorScaleType') {
        // Dropdown for colorScaleType
        inputElement = document.createElement('select');
        inputElement.className = 'option-input option-select';
        inputElement.dataset.key = key;
        
        const scaleTypes = ['linear', 'quadratic', 'cubic', 'squareRoot', 'cubeRoot'];
        scaleTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            option.selected = (type === value);
            inputElement.appendChild(option);
        });
        
        inputElement.addEventListener('change', (e) => updateOption(key, e.target.value));
    } else if (key === 'defaultPlaceCategory') {
        // Dropdown for defaultPlaceCategory
        inputElement = document.createElement('select');
        inputElement.className = 'option-input option-select';
        inputElement.dataset.key = key;
        
        const categories = [['Site ID', 'site'], ['Latitude', 'latitude'], ['Longitude', 'longitude'], ['Depth', 'depth']];
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category[1];
            option.textContent = category[0];
            option.selected = (category[1] === value);
            inputElement.appendChild(option);
        });
        
        inputElement.addEventListener('change', (e) => updateOption(key, e.target.value));
    } else if (key === 'dataSet') {
        // Dropdown for dataSet
        inputElement = document.createElement('select');
        inputElement.className = 'option-input option-select';
        inputElement.dataset.key = key;
        
        if (DATA_SETS && Array.isArray(DATA_SETS)) {
            DATA_SETS.forEach(dataset => {
                const option = document.createElement('option');
                option.value = dataset;
                option.textContent = dataset;
                option.selected = (dataset === value);
                inputElement.appendChild(option);
            });
        }
        
        inputElement.addEventListener('change', (e) => updateOption(key, e.target.value));
    } else if (Array.isArray(value)) {
        // List container with add/remove functionality
        inputElement = document.createElement('div');
        inputElement.className = 'option-list-container';
        inputElement.dataset.key = key;
        
        // Create list items
        value.forEach((item, idx) => {
            const listItem = createListItem(item, key, idx);
            inputElement.appendChild(listItem);
        });
        
        // Add button to add new item
        const addBtn = document.createElement('button');
        addBtn.className = 'option-add-btn';
        addBtn.textContent = '+ Add';
        addBtn.addEventListener('click', () => addListItem(key, inputElement));
        
        inputElement.appendChild(addBtn);
    } else if (typeof value === 'number') {
        // Number input
        inputElement = document.createElement('input');
        inputElement.type = 'number';
        inputElement.className = 'option-input option-number';
        inputElement.value = value;
        inputElement.dataset.key = key;
        inputElement.addEventListener('change', (e) => updateOption(key, parseFloat(e.target.value)));
    } else if (typeof value === 'object' && value !== null) {
        // Check if it's a timeRange object with from/to properties
        if ('from' in value && 'to' in value) {
            inputElement = document.createElement('div');
            inputElement.className = 'option-timerange-container';
            inputElement.dataset.key = key;
            
            // From field
            const fromLabel = document.createElement('label');
            fromLabel.className = 'option-timerange-label';
            fromLabel.textContent = 'From:';
            
            const fromInput = document.createElement('input');
            fromInput.type = 'text';
            fromInput.className = 'option-input option-timerange-input';
            fromInput.value = value.from;
            fromInput.dataset.key = key;
            fromInput.dataset.field = 'from';
            fromInput.addEventListener('change', (e) => updateTimeRangeField(key, 'from', e.target.value));
            
            // To field
            const toLabel = document.createElement('label');
            toLabel.className = 'option-timerange-label';
            toLabel.textContent = 'To:';
            
            const toInput = document.createElement('input');
            toInput.type = 'text';
            toInput.className = 'option-input option-timerange-input';
            toInput.value = value.to;
            toInput.dataset.key = key;
            toInput.dataset.field = 'to';
            toInput.addEventListener('change', (e) => updateTimeRangeField(key, 'to', e.target.value));
            
            inputElement.appendChild(fromLabel);
            inputElement.appendChild(fromInput);
            inputElement.appendChild(toLabel);
            inputElement.appendChild(toInput);
        } else {
            // For other objects, display as JSON
            inputElement = document.createElement('textarea');
            inputElement.className = 'option-input option-textarea';
            inputElement.value = JSON.stringify(value, null, 2);
            inputElement.dataset.key = key;
            inputElement.addEventListener('change', (e) => {
                try {
                    updateOption(key, JSON.parse(e.target.value));
                } catch (error) {
                    console.error('Invalid JSON format:', error);
                    alert('Invalid JSON format');
                }
            });
        }
    } else {
        // Text input for strings
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.className = 'option-input option-text';
        inputElement.value = value;
        inputElement.dataset.key = key;
        inputElement.addEventListener('change', (e) => updateOption(key, e.target.value));
    }
    
    item.appendChild(label);
    item.appendChild(inputElement);
    
    return item;
}

/**
 * Create a list item with remove button
 */
function createListItem(itemValue, key, index) {
    const listItem = document.createElement('div');
    listItem.className = 'option-list-item';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'option-input option-list-input';
    input.value = itemValue;
    input.dataset.key = key;
    input.dataset.index = index;
    input.addEventListener('change', (e) => updateListItem(key, index, e.target.value));
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'option-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => removeListItem(key, index, listItem));
    
    listItem.appendChild(input);
    listItem.appendChild(removeBtn);
    
    return listItem;
}

/**
 * Add a new item to a list
 */
function addListItem(key, container) {
    const newIndex = optionsData[key].length;
    optionsData[key].push('');
    
    const listItem = createListItem('', key, newIndex);
    container.insertBefore(listItem, container.lastChild);
}

/**
 * Remove an item from a list
 */
function removeListItem(key, index, element) {
    optionsData[key].splice(index, 1);
    element.remove();
    updateOption(key, optionsData[key]);
}

/**
 * Update a time range field (from or to)
 */
function updateTimeRangeField(key, field, newValue) {
    optionsData[key][field] = newValue;
    updateOption(key, optionsData[key]);
}

/**
 * Update list item value
 */
function updateListItem(key, index, newValue) {
    optionsData[key][index] = newValue;
    updateOption(key, optionsData[key]);
}

/**
 * Update option value
 */
function updateOption(key, newValue) {
    optionsData[key] = newValue;
    console.log(`Updated ${key}:`, newValue);
}

/**
 * Format key name for display (camelCase to Title Case)
 */
function formatKeyName(key) {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
}

/**
 * Close the options overlay
 */
function closeOptionsOverlay() {
    if (optionsOverlay) {
        optionsOverlay.remove();
        optionsOverlay = null;
    }
}/**
 * Save options to server and reload
 */
async function saveAndReloadOptions(data) {
    try {
        const response = await fetch('/save-options', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            console.log('Options saved successfully');
            closeOptionsOverlay();
            // Wait 500ms to ensure file is written on server before reloading
            await new Promise(resolve => setTimeout(resolve, 500));
            localStorage.clear();
            location.reload();
        } else {
            const errorData = await response.json();
            console.error('Error saving options:', errorData);
            alert('Failed to save options: ' + (errorData.detail || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving options:', error);
        alert('Error saving options: ' + error.message);
    }
}// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initOptionsHandler);
