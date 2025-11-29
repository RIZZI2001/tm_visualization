// app.js — fetch API, parse CSV, render heatmap using d3
(function(){
  const API = '/data';

  // Build request payload: topic 5 from Output/16s/TM_Topics/11_topics.csv
  const payload = {
    file: 'Output/16s/TM_Topics/11_topics.csv',
    table_type: 'topic',
    specs: {
      topic: { type: 'single', value: 5 },
      sample: {
        // request wide range (all times) — adjust as needed for your data
        time: { type: 'range', year: [2022, 2023], week: [1, 53] },
        place: { place_type: 'site', site: { type: 'range', value: [2, 15] } },
        average: false
      }
    }
  };

  const statusEl = d3.select('#status');

  function fetchDataForPayload(p) {
    const q = encodeURIComponent(JSON.stringify(p));
    return fetch(`${API}?attribute=${q}`).then(r => {
      if(!r.ok) throw new Error('API error: ' + r.status + ' ' + r.statusText);
      return r.text();
    });
  }

  function renderInto(containerSelector, csvText, title) {
    // parse CSV with d3
    const rows = d3.csvParse(csvText);
    const cols = rows.columns;
    if(!cols || cols.length < 2) {
      statusEl.text('No data returned or unexpected CSV format.');
      return;
    }

    const rowKey = cols[0]; // time label column (from server)
    const placeKeys = cols.slice(1); // place columns

    // collect all time keys (in order returned by server rows)
    const timeKeys = rows.map(r => r[rowKey]);

    // parse time label like 'M0323' -> { year: 23, week: 03, day: 'M' }
    function parseTimeLabel(s){
      const str = String(s || '');
      const day = str.charAt(0) || '';
      const week = parseInt(str.slice(1,3) || '0', 10);
      const year = parseInt(str.slice(3,5) || '0', 10);
      const dayOrder = { 'X': 0, 'M': 1, 'T': 2 };
      const dord = (dayOrder[day] !== undefined) ? dayOrder[day] : 3;
      return { year, week, day, dord };
    }

    // sort time keys by year, then week, then day
    const timeSorted = Array.from(new Set(timeKeys)).sort((a,b) => {
      const ta = parseTimeLabel(a);
      const tb = parseTimeLabel(b);
      if(ta.year !== tb.year) return ta.year - tb.year;
      if(ta.week !== tb.week) return ta.week - tb.week;
      return ta.dord - tb.dord;
    });

    // build matrix with rows = places and cols = times
    const matrix = placeKeys.map(place => {
      return {
        place,
        vals: timeSorted.map(tk => {
          // find row with time == tk
          const row = rows.find(r => String(r[rowKey]) === String(tk));
          if(!row) return NaN;
          const v = row[place];
          const n = v === undefined || v === null || v === '' ? NaN : +v;
          return isNaN(n) ? NaN : n;
        })
      };
    });

    // compute domain
    let vmin = Infinity, vmax = -Infinity;
    matrix.forEach(r => r.vals.forEach(v => { if(!isNaN(v)) { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }}));
    if(vmin === Infinity) { vmin = 0; vmax = 1; }

    // sizing
    const cellSize = 18;
    const margin = { top: 140, right: 20, bottom: 120, left: 120 };
    const nRows = matrix.length; // places
    const nCols = timeSorted.length; // times
    const width = Math.max(400, nCols * cellSize) + margin.left + margin.right;
    const height = Math.max(200, nRows * cellSize) + margin.top + margin.bottom;

    // clear and create svg inside provided container
    d3.select(containerSelector).selectAll('*').remove();
    const svg = d3.select(containerSelector).append('svg').attr('width', width).attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // color scale
    const color = d3.scaleSequential(d3.interpolateViridis).domain([vmin, vmax]);

    // scales
    const y = d3.scaleBand().domain(matrix.map(d => d.place)).rangeRound([0, nRows * cellSize]).padding(0);
    const x = d3.scaleBand().domain(timeSorted).rangeRound([0, nCols * cellSize]).padding(0);

    // cells
    const cellsG = g.append('g').attr('class','cells');
    const tooltip = d3.select('body').selectAll('.tooltip').data([0]);
    const tooltipDiv = tooltip.enter().append('div').attr('class','tooltip').style('display','none').merge(tooltip);

    matrix.forEach((r, i) => {
      timeSorted.forEach((tk, j) => {
        const val = r.vals[j];
        cellsG.append('rect')
          .attr('class','cell')
          .attr('x', x(tk))
          .attr('y', y(r.place))
          .attr('width', x.bandwidth())
          .attr('height', y.bandwidth())
          .style('fill', isNaN(val) ? '#f7f7f7' : color(val))
          .style('stroke','none')
          .on('mousemove', (e) => {
            tooltipDiv.style('display','block')
                   .style('left',(e.pageX+10)+'px')
                   .style('top',(e.pageY+10)+'px')
                   .html(`place: <b>${r.place}</b><br/>time: <b>${tk}</b><br/>value: <b>${isNaN(val)?'NA':val}</b>`);
          })
          .on('mouseout', () => tooltipDiv.style('display','none'));
      });
    });

    // column labels (times) — show rotated
    const colLabelG = svg.append('g').attr('transform', `translate(${margin.left},${margin.top-6})`);
    colLabelG.selectAll('text').data(timeSorted).enter().append('text')
      .text(d => d)
      .attr('x', (d,i) => x(d) + x.bandwidth()/2)
      .attr('y', 0)
      .attr('text-anchor','start')
      .attr('transform', (d,i) => `translate(${x(d)+x.bandwidth()/2},0) rotate(-65)`)
      .style('font-size','11px');

    // row labels (places)
    const rowLabelG = svg.append('g').attr('transform', `translate(${margin.left-6},${margin.top})`);
    rowLabelG.selectAll('text').data(matrix).enter().append('text')
      .text(d => d.place)
      .attr('x', 0)
      .attr('y', (d,i) => y(d.place) + y.bandwidth()/2)
      .attr('text-anchor','end')
      .attr('dy','0.35em')
      .style('font-size','11px');

    // color legend
    const legendWidth = 200, legendHeight = 10;
    const legendG = svg.append('g').attr('transform', `translate(${margin.left},${margin.top + nRows*cellSize + 25})`);
    const legendScale = d3.scaleLinear().domain([vmin, vmax]).range([0, legendWidth]);
    const legendAxis = d3.axisBottom(legendScale).ticks(5);

    // gradient
    const defs = svg.append('defs');
    const gradId = 'g1';
    const grad = defs.append('linearGradient').attr('id', gradId).attr('x1','0%').attr('x2','100%');
    const stops = 8;
    for(let i=0;i<=stops;i++){
      const t = i/stops;
      grad.append('stop').attr('offset', `${t*100}%`).attr('stop-color', d3.interpolateViridis(t));
    }
    legendG.append('rect').attr('width', legendWidth).attr('height', legendHeight).style('fill', `url(#${gradId})`);
    legendG.append('g').attr('transform', `translate(0,${legendHeight})`).call(legendAxis);

    // add title above the chart
    if(title){
      d3.select(containerSelector).insert('div', ':first-child').attr('class','topic-title').style('font-weight','bold').style('margin','6px 0').text(title);
    }
    statusEl.text('Rendered heatmap (places × times)');
  }

  // Render all topics 1..11 stacked vertically
  async function renderAllTopics(){
    statusEl.text('Fetching topics 1..11...');
    const chartRoot = d3.select('#chart');
    chartRoot.selectAll('*').remove();

    for(let t=1; t<=11; t++){
      // create container for this topic
      const containerId = `topic-${t}`;
      chartRoot.append('div').attr('id', containerId).attr('class','topic-container').style('margin-bottom','30px');

      // set payload topic to single
      payload.specs.topic = { type: 'single', value: t };
      try{
        const csv = await fetchDataForPayload(payload);
        renderInto(`#${containerId}`, csv, `Topic ${t}`);
      }catch(err){
        d3.select(`#${containerId}`).append('div').text('Error fetching topic ' + t + ': ' + err.message);
        console.error(err);
      }
    }
    statusEl.text('All topics rendered');
  }

  // run
  renderAllTopics().catch(err => {
    statusEl.text('Error: ' + err.message);
    console.error(err);
  });

})();
