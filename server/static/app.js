//GLOBALS:

//row, column, depth
var axis_categories = ['time', 'topic', 'place'];

(async function(){
  const API = '/data';
  const root = document.getElementById('chart') || document.body;

  const payload = {
    "file": "Output/16s/TM_Topics/50_topics.csv",
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
                },
                "latitude": {
                    "type": "range",
                    "value": [53.0, 55.0]
                },
                "longitude": {
                    "type": "range",
                    "value": [11.0, 13.0]
                }
            },
            "average": "place"
        },
        "attribute": {
            "type": "list",
            "value": ["temperature"]
        },
        "otu": {
            "type": "list",
            "prefix": "otu_16s_",
            "value": [2, 3, 1]
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
        visualizeCSV(root, resp, true);
    }catch(e){ console.error(e); }

})();
