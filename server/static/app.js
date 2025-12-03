//GLOBALS:

//row, column, depth
var axis_categories = ['time', 'topic', 'place'];

(async function(){
  const API = '/data';
  const root = document.getElementById('chart') || document.body;

  const payload = {
    "file": "Output/18s/TM_Topics/50_topics.csv",
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
        visualizeCSV(root, resp, true, payload);
    }catch(e){ console.error(e); }

})();
