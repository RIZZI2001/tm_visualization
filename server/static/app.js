//GLOBALS:
var dataSet = '18s';
var topicSet = 30;

//row, column, depth
var axis_categories = ['topic', 'time', 'place'];

(async function(){
  const API = '/data';
  const root = document.getElementById('heatmap-section') || document.getElementById('chart-container') || document.body;

  const payload = {
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

    async function fetchCSV(){
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
        const resp = await fetchCSV();
        axis_categories = resp.axis;
        visualizeCSV(root, resp, payload);
    }catch(e){ console.error(e); }

})();
