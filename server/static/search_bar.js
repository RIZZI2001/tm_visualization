// Recursive Search Bar Menu

// ====== CONSTANTS ======

const submenuReferences = {};
const submenuStates = [];
const unhoverTimeouts = {};

let dropdownMenu = null;

// ====== INITIALIZATION ======

document.addEventListener('DOMContentLoaded', () => {
    const searchBar = document.getElementById('search-bar');
    
    searchBar.addEventListener('focus', () => {
        searchBar.value = '';
        openDropdown();
    });
    
    searchBar.addEventListener('blur', () => {
        closeDropdown();
        closeAllSubmenus();
    });
    
    searchBar.addEventListener('input', () => {
        if (searchBar.value === '') {
            closeDropdown();
            closeAllSubmenus();
            openDropdown();
        } else {
            const results = searchItems(searchBar.value);
            showSearchResults(results);
        }
    });
    
    searchBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const results = searchItems(searchBar.value);
            
            // Display search results
            showSearchResults(results);
            
            // If only one result, click it
            if (results.length === 1 && dropdownMenu) {
                const resultItem = dropdownMenu.querySelector('.search-dropdown-item');
                if (resultItem) {
                    resultItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                }
            }
        }
    });
});

// ====== DROPDOWN MANAGEMENT ======

/**
 * Open the main dropdown menu below the search bar
 */
function openDropdown() {
    if (dropdownMenu) return;
    
    const searchBar = document.getElementById('search-bar');
    const searchBarRect = searchBar.getBoundingClientRect();
    
    dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'search-dropdown';
    dropdownMenu.style.right = '15px';
    dropdownMenu.style.top = (searchBarRect.bottom + 4) + 'px';
    
    // Taxonomy item
    const taxonomyItem = document.createElement('div');
    taxonomyItem.className = 'search-dropdown-item';
    taxonomyItem.textContent = 'Taxonomy';
    
    taxonomyItem.addEventListener('mouseenter', () => {
        openSubMenu(TAXONOMY_DICT, 'taxonomy', 0, taxonomyItem, ['taxonomy']);
    });
    
    taxonomyItem.addEventListener('mouseleave', () => {
        const firstChildState = submenuStates[0];
        if (firstChildState) {
            const oldParentItem = firstChildState.parentItem;
            firstChildState.parentItem = null;
            
            const secondChildState = submenuStates[1];
            if (secondChildState && submenuReferences[1] && secondChildState.parentItem === oldParentItem) {
                secondChildState.parentItem = null;
                if (!shouldSubmenuStayOpen(1)) {
                    scheduleUnhoverHandler(1);
                }
            }
            
            if (!shouldSubmenuStayOpen(0)) {
                scheduleUnhoverHandler(0);
            }
        }
    });
    
    dropdownMenu.appendChild(taxonomyItem);
    
    // Metadata item
    const metadataItem = document.createElement('div');
    metadataItem.className = 'search-dropdown-item';
    metadataItem.textContent = 'Metadata';
    
    metadataItem.addEventListener('mouseenter', () => {
        const metadataOptions = {};
        if (SPECS.metadataOptions) {
            SPECS.metadataOptions.forEach(option => {
                metadataOptions[option] = {};
            });
        }
        openSubMenu(metadataOptions, 'metadata', 0, metadataItem, ['metadata']);
    });
    
    metadataItem.addEventListener('mouseleave', () => {
        const firstChildState = submenuStates[0];
        if (firstChildState) {
            const oldParentItem = firstChildState.parentItem;
            firstChildState.parentItem = null;
            
            const secondChildState = submenuStates[1];
            if (secondChildState && submenuReferences[1] && secondChildState.parentItem === oldParentItem) {
                secondChildState.parentItem = null;
                if (!shouldSubmenuStayOpen(1)) {
                    scheduleUnhoverHandler(1);
                }
            }
            
            if (!shouldSubmenuStayOpen(0)) {
                scheduleUnhoverHandler(0);
            }
        }
    });
    
    dropdownMenu.appendChild(metadataItem);
    
    // Topics item
    const topicsItem = document.createElement('div');
    topicsItem.className = 'search-dropdown-item';
    topicsItem.textContent = 'Topic';
    
    topicsItem.addEventListener('mouseenter', () => {
        const topicsData = {};
        for (let i = 0; i < TOPIC_SET; i++) {
            topicsData[i] = {};
        }
        openSubMenu(topicsData, 'topic', 0, topicsItem, ['topic']);
    });
    
    topicsItem.addEventListener('mouseleave', () => {
        const firstChildState = submenuStates[0];
        if (firstChildState) {
            const oldParentItem = firstChildState.parentItem;
            firstChildState.parentItem = null;
            
            const secondChildState = submenuStates[1];
            if (secondChildState && submenuReferences[1] && secondChildState.parentItem === oldParentItem) {
                secondChildState.parentItem = null;
                if (!shouldSubmenuStayOpen(1)) {
                    scheduleUnhoverHandler(1);
                }
            }
            
            if (!shouldSubmenuStayOpen(0)) {
                scheduleUnhoverHandler(0);
            }
        }
    });
    
    dropdownMenu.appendChild(topicsItem);
    
    document.body.appendChild(dropdownMenu);
}

/**
 * Close the main dropdown menu
 */
function closeDropdown() {
    if (dropdownMenu) {
        dropdownMenu.remove();
        dropdownMenu = null;
    }
}

/**
 * Close all open submenus and clear their states
 */
function closeAllSubmenus() {
    const depths = Object.keys(submenuReferences)
        .map(d => parseInt(d))
        .sort((a, b) => b - a); // Close from deepest first
    
    depths.forEach(depth => {
        if (submenuReferences[depth]) {
            submenuReferences[depth].remove();
            delete submenuReferences[depth];
            submenuStates[depth] = null;
        }
        if (unhoverTimeouts[depth]) {
            clearTimeout(unhoverTimeouts[depth]);
            delete unhoverTimeouts[depth];
        }
    });
}

// ====== SUBMENU STATE MANAGEMENT ======

/**
 * Initialize or get the state object for a specific submenu depth
 */
function getSubmenuState(depth) {
    if (!submenuStates[depth]) {
        submenuStates[depth] = {
            parentItem: null,
            selfHovered: false,
            childOpen: false,
            path: []
        };
    }
    return submenuStates[depth];
}

/**
 * Check if a submenu should remain open based on its state
 */
function shouldSubmenuStayOpen(depth) {
    const state = getSubmenuState(depth);
    return state.parentItem !== null || state.selfHovered || state.childOpen;
}

/**
 * Update submenu state and check if it should be closed
 */
function updateSubmenuState(depth, updates) {
    const state = getSubmenuState(depth);
    
    if (unhoverTimeouts[depth]) {
        clearTimeout(unhoverTimeouts[depth]);
        delete unhoverTimeouts[depth];
    }
    
    Object.assign(state, updates);
    
    return false;
}

// ====== SUBMENU OPERATIONS ======

/**
 * Open a submenu for the given data at the specified depth
 */
function openSubMenu(data, key, depth, parentElement, pathPrefix = []) {
    if (unhoverTimeouts[depth]) {
        clearTimeout(unhoverTimeouts[depth]);
        delete unhoverTimeouts[depth];
    }
    
    if (!data || typeof data !== 'object' || !Object.keys(data).length) {
        return;
    }
    
    // Close all deeper submenus and this depth level if it exists
    const depthsToRemove = Object.keys(submenuReferences)
        .map(d => parseInt(d))
        .filter(d => d >= depth)
        .sort((a, b) => b - a);
    
    depthsToRemove.forEach(d => {
        if (submenuReferences[d]) {
            submenuReferences[d].remove();
            delete submenuReferences[d];
            submenuStates[d] = null;
        }
    });
    
    // Create new submenu
    const menu = document.createElement('div');
    menu.className = 'search-submenu';
    menu.dataset.depth = depth;
    
    Object.keys(data).sort().forEach(itemKey => {
        const itemValue = data[itemKey];
        const item = document.createElement('div');
        item.className = 'search-submenu-item';
        if(key === 'topic') {
            item.textContent = nameOfTopic(itemKey);
        } else {
            item.textContent = itemKey;
        }
        item.dataset.key = itemKey;
        
        const hasChildren = itemValue && typeof itemValue === 'object' && Object.keys(itemValue).length > 0;
        
        if (hasChildren) {
            item.addEventListener('mouseenter', () => {
                // Build path for child submenu
                const currentState = getSubmenuState(depth);
                const childPath = [...currentState.path, itemKey];
                openSubMenu(itemValue, itemKey, depth + 1, item, childPath);
            });
        }
        
        // All items (with or without children) can be selected
        item.style.cursor = 'pointer';
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const searchBar = document.getElementById('search-bar');
            
            const currentState = getSubmenuState(depth);
            const fullPath = [...currentState.path, itemKey];

            const name = (key === 'topic') ? nameOfTopic(itemKey) : itemKey;
            openDetailView(fullPath, name);
            
            closeDropdown();
            closeAllSubmenus();
            searchBar.blur();

            searchBar.value = name;
        });
        
        menu.appendChild(item);
    });
    
    // Set up hover listeners
    menu.addEventListener('mouseenter', () => {
        updateSubmenuState(depth, { selfHovered: true });
        
        if (depth > 0) {
            const parentState = getSubmenuState(depth - 1);
            parentState.childOpen = true;
        }
    });
    
    menu.addEventListener('mouseleave', () => {
        scheduleUnhoverHandler(depth);
    });
    
    document.body.appendChild(menu);
    submenuReferences[depth] = menu;
    
    updateSubmenuState(depth, {
        parentItem: key,
        selfHovered: false,
        childOpen: false,
        path: pathPrefix
    });
    
    positionSubMenu(parentElement, menu);
}

/**
 * Schedule unhover handler with 100ms delay
 */
function scheduleUnhoverHandler(depth) {
    if (unhoverTimeouts[depth]) {
        return;
    }
    
    unhoverTimeouts[depth] = setTimeout(() => {
        executeSubmenuUnhover(depth);
        delete unhoverTimeouts[depth];
    }, 100);
}

/**
 * Execute unhover logic for a submenu
 */
function executeSubmenuUnhover(depth) {
    const submenu = submenuReferences[depth];
    
    if (!submenu) {
        return;
    }
    
    const state = getSubmenuState(depth);
    state.selfHovered = false;
    
    const childDepth = depth + 1;
    const childState = getSubmenuState(childDepth);
    
    // Clear child's parentItem reference
    if (submenuReferences[childDepth]) {
        childState.parentItem = null;
        
        if (!shouldSubmenuStayOpen(childDepth)) {
            closeSubmenuAtDepth(childDepth);
        }
    }
    
    // Check if this submenu should close
    if (!shouldSubmenuStayOpen(depth)) {
        closeSubmenuAtDepth(depth);
        
        if (depth > 0) {
            const parentState = getSubmenuState(depth - 1);
            parentState.childOpen = false;
            
            if (!shouldSubmenuStayOpen(depth - 1)) {
                closeSubmenuAtDepth(depth - 1);
            }
        }
    }
}

/**
 * Close a submenu and all deeper ones
 */
function closeSubmenuAtDepth(depth) {
    const submenu = submenuReferences[depth];
    
    if (!submenu) {
        return;
    }
    
    // Close all deeper submenus
    const depthsToRemove = Object.keys(submenuReferences)
        .map(d => parseInt(d))
        .filter(d => d > depth)
        .sort((a, b) => b - a);
    
    depthsToRemove.forEach(d => {
        if (submenuReferences[d]) {
            submenuReferences[d].remove();
            delete submenuReferences[d];
            submenuStates[d] = null;
        }
    });
    
    // Close this submenu
    submenu.remove();
    delete submenuReferences[depth];
    submenuStates[depth] = null;
    
    // Notify parent
    if (depth > 0) {
        const parentState = getSubmenuState(depth - 1);
        parentState.childOpen = false;
        
        if (!shouldSubmenuStayOpen(depth - 1)) {
            scheduleUnhoverHandler(depth - 1);
        }
    }
}

// ====== UTILITIES ======

/**
 * Position a submenu relative to its parent element
 */
function positionSubMenu(parentElement, menu) {
    const rect = parentElement.getBoundingClientRect();
    menu.style.top = rect.top + 'px';
    menu.style.right = (window.innerWidth - rect.left) + 'px';
}

/**
 * Search through metadata, topics, and taxonomy for items matching the search text
 * Returns up to 20 results with their paths
 */
function searchItems(searchText) {
    const searchLower = searchText.toLowerCase();
    const results = [];
    const MAX_RESULTS = 20;
    
    // Search metadata options
    if (SPECS.metadataOptions) {
        SPECS.metadataOptions.forEach(option => {
            if (results.length >= MAX_RESULTS) return;
            if (option.toLowerCase().includes(searchLower)) {
                results.push({
                    name: option,
                    path: ['metadata', option]
                });
            }
        });
    }
    
    // Search topics
    if (TOPIC_SET !== undefined) {
        for (let i = 0; i < TOPIC_SET; i++) {
            if (results.length >= MAX_RESULTS) return results;
            const topicName = nameOfTopic(i);
            if (topicName.toLowerCase().includes(searchLower)) {
                results.push({
                    name: topicName,
                    path: ['topic', i]
                });
            }
        }
    }
    
    // Search taxonomy tree
    searchTaxonomyTree(TAXONOMY_DICT, searchLower, [], results, MAX_RESULTS);
    
    return results;
}

/**
 * Recursively search through taxonomy tree
 */
function searchTaxonomyTree(node, searchLower, currentPath, results, maxResults) {
    if (results.length >= maxResults) return;
    
    Object.keys(node).forEach(key => {
        if (results.length >= maxResults) return;
        
        const itemValue = node[key];
        const newPath = [...currentPath, key];
        
        // Check if current item matches
        if (key.toLowerCase().includes(searchLower)) {
            results.push({
                name: key,
                path: ['taxonomy', ...newPath]
            });
        }
        
        // Recurse into children
        if (typeof itemValue === 'object' && itemValue !== null && Object.keys(itemValue).length > 0) {
            searchTaxonomyTree(itemValue, searchLower, newPath, results, maxResults);
        }
    });
}

/**
 * Display search results in the dropdown
 */
function showSearchResults(results) {
    closeDropdown();
    closeAllSubmenus();
    
    if (results.length === 0) {
        return;
    }
    
    const searchBar = document.getElementById('search-bar');
    const searchBarRect = searchBar.getBoundingClientRect();
    
    dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'search-dropdown';
    dropdownMenu.style.right = '15px';
    dropdownMenu.style.top = (searchBarRect.bottom + 4) + 'px';
    
    // Create dropdown items from search results
    results.forEach(result => {
        const item = document.createElement('div');
        item.className = 'search-dropdown-item';
        item.textContent = result.name;
        item.style.cursor = 'pointer';
        
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            
            openDetailView(result.path, result.name);
            
            closeDropdown();
            closeAllSubmenus();
            searchBar.blur();

            searchBar.value = result.name;
        });
        
        dropdownMenu.appendChild(item);
    });
    
    document.body.appendChild(dropdownMenu);
}


function openDetailView(fullPath, name = null) {
    console.log('Opening detail view for path:', fullPath, 'with name:', name);
    if(fullPath[0] === 'taxonomy') {
        const otus = generateOTUList(fullPath.slice(1));
        showDetailView('otu', false, otus, true, name);
    } else {
        showDetailView(fullPath[0], true, [fullPath[1]], historyEntry = true, customTitle = name);
    }
}

