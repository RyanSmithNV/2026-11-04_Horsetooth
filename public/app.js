/* Horsetooth Reservoir dashboard — USBR HydroMet station HTOOTHR */
(function () {
  'use strict';

  var DATA_URL = './data.json';
  var PALETTE = {
    FB: '#7b68ae',
    AF: '#6a9a6a',
    QD: '#d4af37',
    IN: '#4a8fb5',
    PP: '#7a8ba8'
  };
  var SERIES_TITLE = {
    FB: 'Water level / elevation',
    AF: 'Storage content',
    QD: 'Outflow — total discharge',
    IN: 'Inflow — computed',
    PP: 'Precipitation',
    FB_QD: 'Water level + outflow'
  };

  var state = { data: null, chart: null, series: 'FB', range: 365 };

  /* ---------- helpers ---------- */

  function fmt(v, digits) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Number(v).toLocaleString('en-US', {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0
    });
  }

  function fmtDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function toPoints(series) {
    var keys = Object.keys(series).sort();
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var t = new Date(keys[i] + 'T00:00:00').getTime();
      out.push([t, series[keys[i]]]);
    }
    return out;
  }

  /* ---------- cards ---------- */

  function renderCards() {
    var d = state.data;
    var defs = [
      { key: 'FB', cls: '', digits: 2, unit: 'ft', deltaDays: 1 },
      { key: 'AF', cls: 'storage', digits: 0, unit: 'acre-ft', deltaDays: 1 },
      { key: 'QD', cls: 'outflow', digits: 1, unit: 'cfs', deltaDays: 1 },
      { key: 'IN', cls: 'inflow', digits: 1, unit: 'cfs', deltaDays: 1 },
      { key: 'PP', cls: 'precip', digits: 2, unit: 'in/day', deltaDays: 1 }
    ];
    var html = '';
    defs.forEach(function (def) {
      var s = d.stats[def.key];
      if (!s) return;
      var series = d.data[def.key];
      var keys = Object.keys(series).sort();
      var last = keys[keys.length - 1];
      var prev = keys[keys.length - 1 - (def.deltaDays || 1)];
      var delta = prev !== undefined ? series[last] - series[prev] : null;
      var arrow = delta === null ? '' : (delta > 0 ? '▲' : delta < 0 ? '▼' : '—');
      var sign = delta === null ? '' : (delta > 0 ? '+' : '');
      var deltaTxt = delta === null
        ? 'no comparison'
        : arrow + ' ' + sign + fmt(delta, def.digits) + ' ' + s.unit + ' vs prior day';
      html += '<div class="card ' + def.cls + '">' +
        '<div class="label">' + def.key + ' · ' + s.label + '</div>' +
        '<div class="value">' + fmt(s.last_value, def.digits) +
        ' <span class="unit">' + s.unit + '</span></div>' +
        '<div class="delta' + (delta > 0 ? ' up' : delta < 0 ? ' down' : '') + '">' +
        deltaTxt + '<br>' + fmtDate(last) + '</div>' +
        '</div>';
    });
    document.getElementById('cards').innerHTML = html;
  }

  /* ---------- chart ---------- */

  function sliceRange(points) {
    if (state.range === 'all') return points;
    var days = state.range;
    if (!points.length) return points;
    var end = points[points.length - 1][0];
    var start = end - days * 86400000;
    var i = 0;
    while (i < points.length && points[i][0] < start) i++;
    // include one point before the window so the line starts at the edge
    if (i > 0) i--;
    return points.slice(i);
  }

  function baseOption(points, unit, color, name, axisIndex) {
    return {
      name: name,
      type: 'line',
      showSymbol: false,
      smooth: 0.15,
      sampling: 'lttb',
      data: points,
      yAxisIndex: axisIndex || 0,
      lineStyle: { width: 2, color: color },
      itemStyle: { color: color },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: color + '2e' },
            { offset: 1, color: color + '00' }
          ]
        }
      }
    };
  }

  function renderChart() {
    if (!state.data || !window.echarts) return;
    var d = state.data;
    var chartEl = document.getElementById('chart');
    if (!state.chart) state.chart = echarts.init(chartEl, null, { renderer: 'canvas' });

    var key = state.series;
    document.getElementById('chart-title').textContent = SERIES_TITLE[key] || key;
    var unitTxt = key === 'FB_QD' ? 'ft + cfs' : (d.units[key] || '');
    document.getElementById('chart-sub').textContent =
      d.station_name + ' · ' + unitTxt +
      (state.range === 'all' ? ' · full record' : ' · last ' + state.range + ' days');

    var series = [];
    var yAxes = [];

    if (key === 'FB_QD') {
      series.push(baseOption(sliceRange(toPoints(d.data.FB)), 'ft', PALETTE.FB, 'Water level (ft)', 0));
      series.push(baseOption(sliceRange(toPoints(d.data.QD)), 'cfs', PALETTE.QD, 'Outflow (cfs)', 1));
      yAxes = [
        { type: 'value', name: 'ft', position: 'left', scale: true,
          nameTextStyle: { color: PALETTE.FB }, axisLabel: { color: PALETTE.FB },
          splitLine: { lineStyle: { color: '#efece6' } } },
        { type: 'value', name: 'cfs', position: 'right', scale: true,
          nameTextStyle: { color: PALETTE.QD }, axisLabel: { color: PALETTE.QD },
          splitLine: { show: false } }
      ];
    } else {
      var color = PALETTE[key];
      var pts = sliceRange(toPoints(d.data[key]));
      if (key === 'PP') {
        series.push({
          name: d.labels[key], type: 'bar', data: pts, yAxisIndex: 0,
          itemStyle: { color: color + 'b3' }, barMaxWidth: 6
        });
      } else {
        series.push(baseOption(pts, d.units[key], color, d.labels[key], 0));
      }
      yAxes = [{ type: 'value', name: d.units[key], scale: key !== 'FB',
        nameTextStyle: { color: color }, axisLabel: { color: color },
        splitLine: { lineStyle: { color: '#efece6' } } }];
    }

    state.chart.setOption({
      animationDuration: 400,
      grid: { left: 62, right: key === 'FB_QD' ? 68 : 24, top: 34, bottom: 54 },
      legend: { top: 0, textStyle: { color: '#6b675f', fontSize: 12 } },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1a0a2e',
        borderWidth: 0,
        textStyle: { color: '#faf8f5', fontSize: 12 },
        formatter: function (params) {
          var dt = new Date(params[0].value[0]);
          var head = '<strong>' + fmtDate(dt.toISOString().slice(0, 10)) + '</strong>';
          var rows = params.map(function (p) {
            return p.marker + ' ' + p.seriesName + ': <strong>' +
              fmt(p.value[1], 2) + '</strong>';
          });
          return head + '<br>' + rows.join('<br>');
        }
      },
      toolbox: {
        right: 6, top: 0,
        feature: {
          dataZoom: { yAxisIndex: 'none', title: { zoom: 'Zoom', back: 'Reset zoom' } },
          restore: { title: 'Reset' },
          saveAsImage: { title: 'Save PNG', backgroundColor: '#ffffff' }
        },
        iconStyle: { borderColor: '#7b68ae' }
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#d8d2c8' } },
        axisLabel: { color: '#6b675f', fontSize: 11 },
        splitLine: { show: false }
      },
      yAxis: yAxes,
      dataZoom: [
        { type: 'inside', throttle: 40 },
        { type: 'slider', height: 20, bottom: 12, borderColor: '#e6e1d8',
          backgroundColor: '#faf8f5', fillerColor: 'rgba(123,104,174,0.14)',
          handleStyle: { color: '#7b68ae' }, textStyle: { color: '#6b675f', fontSize: 10 } }
      ],
      series: series
    }, true);
  }

  /* ---------- monthly table ---------- */

  function renderMonthly() {
    var d = state.data;
    var fb = d.data.FB;
    var months = {};
    Object.keys(fb).sort().forEach(function (iso) {
      var m = iso.slice(0, 7);
      if (!months[m]) months[m] = { first: fb[iso], last: fb[iso], fb: true };
      else { months[m].last = fb[iso]; months[m].fb = true; }
    });
    function agg(key, fn) {
      var acc = {}, cnt = {};
      Object.keys(d.data[key] || {}).forEach(function (iso) {
        var m = iso.slice(0, 7);
        acc[m] = (acc[m] || 0) + d.data[key][iso];
        cnt[m] = (cnt[m] || 0) + 1;
      });
      return function (m) { return cnt[m] ? fn(acc[m], cnt[m]) : null; };
    }
    var avgIn = agg('IN', function (a, c) { return a / c; });
    var avgOut = agg('QD', function (a, c) { return a / c; });
    var sumPP = agg('PP', function (a) { return a; });
    var avgAF = agg('AF', function (a, c) { return a / c; });

    var keys = Object.keys(months).sort();
    var start = state.range === 'all' ? 0 : Math.max(0, keys.length - Math.ceil(state.range / 30));
    var rows = '';
    for (var i = start; i < keys.length; i++) {
      var m = keys[i];
      var rec = months[m];
      var mm = new Date(m + '-01T00:00:00');
      var name = mm.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      var change = rec.fb ? rec.last - rec.first : null;
      rows += '<tr><td>' + name + '</td>' +
        '<td class="num">' + fmt(rec.first, 2) + '</td>' +
        '<td class="num">' + fmt(rec.last, 2) + '</td>' +
        '<td class="num">' + (change === null ? '—' :
          (change > 0 ? '+' : '') + fmt(change, 2)) + '</td>' +
        '<td class="num">' + fmt(avgAF(m), 0) + '</td>' +
        '<td class="num">' + fmt(avgIn(m), 1) + '</td>' +
        '<td class="num">' + fmt(avgOut(m), 1) + '</td>' +
        '<td class="num">' + fmt(sumPP(m), 2) + '</td></tr>';
    }
    document.querySelector('#monthly tbody').innerHTML = rows;
    document.getElementById('monthly-range').textContent =
      keys.length ? '(' + keys[0] + ' … ' + keys[keys.length - 1] + ')' : '';
  }

  /* ---------- load ---------- */

  function renderMeta() {
    var d = state.data;
    document.getElementById('meta').textContent =
      d.stats.FB.count + ' daily points · record ' + d.stats.FB.first_date +
      ' to ' + d.stats.FB.last_date + ' · source ' + d.report;
    document.getElementById('stamp').textContent =
      'Dataset generated ' + d.generated + ' · ' + d.note;
  }

  function renderAll() {
    renderCards();
    renderChart();
    renderMonthly();
    renderMeta();
  }

  function load() {
    var btn = document.getElementById('refresh');
    btn.disabled = true;
    btn.textContent = 'Loading…';
    fetch(DATA_URL, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        state.data = d;
        renderAll();
      })
      .catch(function (err) {
        document.getElementById('chart-sub').textContent =
          'Failed to load data: ' + err.message;
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = 'Refresh data';
      });
  }

  document.getElementById('series').addEventListener('change', function (e) {
    state.series = e.target.value;
    renderChart();
  });
  document.getElementById('range').addEventListener('change', function (e) {
    state.range = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
    renderChart();
    renderMonthly();
  });
  document.getElementById('refresh').addEventListener('click', load);
  window.addEventListener('resize', function () {
    if (state.chart) state.chart.resize();
  });

  load();
})();
