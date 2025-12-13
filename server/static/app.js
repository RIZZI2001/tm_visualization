//GLOBALS:
var dataSet = '18s';
var topicSet = 20;

//row, column, depth
var axis_categories = ['topic', 'time', 'place'];

(async function(){
    const API = '/data';
    const root = document.getElementById('heatmap-section') || document.getElementById('chart-container') || document.body;
    const lineGraphSection = document.getElementById('linegraph-section');

    const heatMapPayload = {
        "file": `Output/${dataSet}/TM_Topics/${topicSet}_topics.csv`,
        "table_type": "topic",
        "specs": {
            "sample": {
                "time": {
                    "type": "all",
                    "year": [],
                    "week": []},
                    "day": "all",
                "place": {
                    "place_type": "site",
                    "site": {
                        "type": "range",
                        "value": [2, 15]
                    }
                },
                "average": "place"
            },
            "attribute": {
                "type": "list",
                "value": ["temperature"]
            },
            "topic": {
                "type": "all",
                "value": []
            }
        }
    };
    const lineGraphPayload = {
        "file": "Input/metadata.csv",
        "table_type": "metadata",
        "specs": {
            "sample": {
                "time": {
                    "type": "range",
                    "year": [2022, 2023],
                    "week": [17, 20]
                },
                "day": "all",
                "place": {
                    "place_type": "site",
                    "site": {
                        "type": "range",
                        "value": [2, 15]
                    }
                },
                "average": "place"
            },
            "attribute": {
                "type": "list",
                "value": ["salinity", "temperature"]
            }
        }
    };


    async function fetchCSV(payload){
        const q = encodeURIComponent(JSON.stringify(payload));
        const res = await fetch(`${API}?attribute=${q}`);
        const ct = res.headers.get('content-type') || '';
        if(ct.includes('application/json')){
            const j = await res.json();
            return { csv: j.csv || '', axis: j.axis || null };
        }
        const text = await res.text();
        return { csv: text, axis: null };
    }

    try{
        const heatResp = await fetchCSV(heatMapPayload);
        axis_categories = heatResp.axis;
        visualizeCSV(root, heatResp, heatMapPayload);
        const lineResp =  await fetchCSV(lineGraphPayload);
        console.log('Line Graph Response:', lineResp);
        visualizeLineGraphs(lineGraphSection, lineResp, lineGraphPayload);

    }catch(e){ console.error(e); }

})();
