/* Obsidian-style force-directed graph of tags and posts. Vanilla JS, canvas-based, no dependencies. */
(function () {
  'use strict';

  var REPULSION = 1800;
  var LINK_DISTANCE = 70;
  var LINK_STRENGTH = 0.05;
  var CENTER_STRENGTH = 0.01;
  var DAMPING = 0.85;
  var ALPHA_DECAY = 0.02;
  var MIN_ALPHA = 0.001;
  var CLICK_MOVE_THRESHOLD = 5;

  function initToggle() {
    var buttons = document.querySelectorAll('.view-toggle-btn');
    var panels = document.querySelectorAll('[data-view-panel]');
    if (!buttons.length) return;

    var graphStarted = false;

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var view = btn.getAttribute('data-view');

        buttons.forEach(function (b) { b.classList.toggle('active', b === btn); });
        panels.forEach(function (p) {
          p.hidden = p.getAttribute('data-view-panel') !== view;
        });

        if (view === 'graph' && !graphStarted) {
          graphStarted = true;
          initGraph();
        }
      });
    });
  }

  function initGraph() {
    var canvas = document.getElementById('tag-graph-canvas');
    var dataEl = document.getElementById('tag-graph-data');
    if (!canvas || !dataEl) return;

    var raw;
    try {
      raw = JSON.parse(dataEl.textContent);
    } catch (e) {
      return;
    }
    if (!raw || !raw.nodes || !raw.nodes.length) return;

    var ctx = canvas.getContext('2d');
    var style = getComputedStyle(document.documentElement);
    var colorTag = style.getPropertyValue('--color-accent-primary').trim() || '#e6c547';
    var colorPost = style.getPropertyValue('--nord8').trim() || '#88c0d0';
    var colorEdge = style.getPropertyValue('--color-border').trim() || '#555555';
    var colorLabel = style.getPropertyValue('--color-text-primary').trim() || '#d8dee9';
    var colorLabelMuted = style.getPropertyValue('--color-text-muted').trim() || '#8b8b8b';
    var colorStroke = style.getPropertyValue('--color-bg-secondary').trim() || '#2a2a2a';

    var byId = {};
    var nodes = raw.nodes.map(function (n) {
      var node = {
        id: n.id,
        label: n.label,
        type: n.type,
        url: n.url,
        count: n.count || 0,
        degree: 0,
        x: (Math.random() - 0.5) * 400,
        y: (Math.random() - 0.5) * 400,
        vx: 0,
        vy: 0,
        fixed: false
      };
      byId[n.id] = node;
      return node;
    });

    var links = [];
    raw.links.forEach(function (l) {
      var source = byId[l.source];
      var target = byId[l.target];
      if (!source || !target) return;
      source.degree++;
      target.degree++;
      links.push({ source: source, target: target });
    });

    nodes.forEach(function (n) {
      n.radius = n.type === 'tag' ? Math.min(8 + n.degree * 1.5, 26) : 5;
    });

    var dpr = window.devicePixelRatio || 1;
    var width = 0;
    var height = 0;
    var transform = { x: 0, y: 0, k: 1 };
    var alpha = 1;
    var running = false;
    var dirty = true;
    var hoverNode = null;
    var dragNode = null;
    var isPanning = false;
    var panStart = { x: 0, y: 0 };
    var panOrigin = { x: 0, y: 0 };
    var pointerDownPos = { x: 0, y: 0 };
    var pointerMoved = false;

    function resize() {
      var rect = canvas.parentElement.getBoundingClientRect();
      width = rect.width;
      height = canvas.clientHeight || 600;
      dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
      wake();
    }

    function screenToWorld(sx, sy) {
      return {
        x: (sx - width / 2 - transform.x) / transform.k,
        y: (sy - height / 2 - transform.y) / transform.k
      };
    }

    function worldToScreen(wx, wy) {
      return {
        x: wx * transform.k + transform.x + width / 2,
        y: wy * transform.k + transform.y + height / 2
      };
    }

    function nodeAt(sx, sy) {
      for (var i = nodes.length - 1; i >= 0; i--) {
        var n = nodes[i];
        var p = worldToScreen(n.x, n.y);
        var r = n.radius * transform.k + 3;
        var dx = sx - p.x;
        var dy = sy - p.y;
        if (dx * dx + dy * dy <= r * r) return n;
      }
      return null;
    }

    function tick() {
      var i, j, n1, n2, dx, dy, distSq, dist, force, fx, fy;

      for (i = 0; i < nodes.length; i++) {
        for (j = i + 1; j < nodes.length; j++) {
          n1 = nodes[i];
          n2 = nodes[j];
          dx = n2.x - n1.x;
          dy = n2.y - n1.y;
          distSq = dx * dx + dy * dy || 0.01;
          dist = Math.sqrt(distSq);
          force = REPULSION / distSq;
          fx = (dx / dist) * force;
          fy = (dy / dist) * force;
          if (!n1.fixed) { n1.vx -= fx; n1.vy -= fy; }
          if (!n2.fixed) { n2.vx += fx; n2.vy += fy; }
        }
      }

      for (i = 0; i < links.length; i++) {
        var link = links[i];
        n1 = link.source;
        n2 = link.target;
        dx = n2.x - n1.x;
        dy = n2.y - n1.y;
        dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var diff = (dist - LINK_DISTANCE) / dist;
        fx = dx * diff * LINK_STRENGTH;
        fy = dy * diff * LINK_STRENGTH;
        if (!n1.fixed) { n1.vx += fx; n1.vy += fy; }
        if (!n2.fixed) { n2.vx -= fx; n2.vy -= fy; }
      }

      for (i = 0; i < nodes.length; i++) {
        n1 = nodes[i];
        n1.vx += -n1.x * CENTER_STRENGTH;
        n1.vy += -n1.y * CENTER_STRENGTH;
      }

      for (i = 0; i < nodes.length; i++) {
        n1 = nodes[i];
        if (n1.fixed) continue;
        n1.vx *= DAMPING;
        n1.vy *= DAMPING;
        n1.x += n1.vx * alpha;
        n1.y += n1.vy * alpha;
      }

      alpha *= (1 - ALPHA_DECAY);
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      var neighbors = null;
      if (hoverNode) {
        neighbors = {};
        neighbors[hoverNode.id] = true;
        links.forEach(function (l) {
          if (l.source === hoverNode) neighbors[l.target.id] = true;
          if (l.target === hoverNode) neighbors[l.source.id] = true;
        });
      }

      ctx.lineWidth = 1;
      links.forEach(function (l) {
        var a = worldToScreen(l.source.x, l.source.y);
        var b = worldToScreen(l.target.x, l.target.y);
        var faded = neighbors && !(neighbors[l.source.id] && neighbors[l.target.id]);
        ctx.globalAlpha = faded ? 0.08 : 0.5;
        ctx.strokeStyle = colorEdge;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
      nodes.forEach(function (n) {
        var p = worldToScreen(n.x, n.y);
        var r = n.radius * transform.k;
        var faded = neighbors && !neighbors[n.id];

        ctx.globalAlpha = faded ? 0.2 : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.type === 'tag' ? colorTag : colorPost;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = colorStroke;
        ctx.stroke();

        var showLabel = n.type === 'tag' ? transform.k > 0.35 : (hoverNode && neighbors[n.id]);
        if (showLabel && !faded) {
          ctx.globalAlpha = 1;
          ctx.font = (n === hoverNode ? 'bold ' : '') + '11px var(--font-system), sans-serif';
          ctx.fillStyle = n === hoverNode || n.type === 'tag' ? colorLabel : colorLabelMuted;
          ctx.textAlign = 'center';
          ctx.fillText(n.label, p.x, p.y - r - 5);
        }
      });
      ctx.globalAlpha = 1;
    }

    function wake() {
      dirty = true;
      if (!running) {
        running = true;
        requestAnimationFrame(loop);
      }
    }

    function loop() {
      var physicsActive = alpha > MIN_ALPHA;
      if (physicsActive) tick();
      if (physicsActive || dirty) {
        draw();
        dirty = false;
      }
      if (physicsActive || dragNode || isPanning) {
        requestAnimationFrame(loop);
      } else {
        running = false;
      }
    }

    function reheat() {
      alpha = Math.max(alpha, 0.3);
      wake();
    }

    canvas.addEventListener('mousedown', function (e) {
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left;
      var sy = e.clientY - rect.top;
      pointerDownPos = { x: sx, y: sy };
      pointerMoved = false;

      var hit = nodeAt(sx, sy);
      if (hit) {
        dragNode = hit;
        dragNode.fixed = true;
      } else {
        isPanning = true;
        panStart = { x: sx, y: sy };
        panOrigin = { x: transform.x, y: transform.y };
      }
      wake();
    });

    window.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left;
      var sy = e.clientY - rect.top;

      if (Math.abs(sx - pointerDownPos.x) > CLICK_MOVE_THRESHOLD || Math.abs(sy - pointerDownPos.y) > CLICK_MOVE_THRESHOLD) {
        pointerMoved = true;
      }

      if (dragNode) {
        var w = screenToWorld(sx, sy);
        dragNode.x = w.x;
        dragNode.y = w.y;
        dragNode.vx = 0;
        dragNode.vy = 0;
        reheat();
        return;
      }

      if (isPanning) {
        transform.x = panOrigin.x + (sx - panStart.x);
        transform.y = panOrigin.y + (sy - panStart.y);
        wake();
        return;
      }

      if (sx < 0 || sy < 0 || sx > width || sy > height) return;
      var hit = nodeAt(sx, sy);
      if (hit !== hoverNode) {
        hoverNode = hit;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
        wake();
      }
    });

    window.addEventListener('mouseup', function (e) {
      if (dragNode) {
        var rect = canvas.getBoundingClientRect();
        var sx = e.clientX - rect.left;
        var sy = e.clientY - rect.top;
        var wasClick = !pointerMoved;
        dragNode.fixed = false;
        if (wasClick && dragNode.url) {
          window.location.href = dragNode.url;
        }
        dragNode = null;
      }
      isPanning = false;
      wake();
    });

    canvas.addEventListener('mouseleave', function () {
      if (hoverNode) {
        hoverNode = null;
        wake();
      }
    });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left;
      var sy = e.clientY - rect.top;
      var before = screenToWorld(sx, sy);
      var scale = e.deltaY < 0 ? 1.1 : 0.9;
      transform.k = Math.min(Math.max(transform.k * scale, 0.15), 4);
      var after = worldToScreen(before.x, before.y);
      transform.x += sx - after.x;
      transform.y += sy - after.y;
      wake();
    }, { passive: false });

    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      var rect = canvas.getBoundingClientRect();
      var sx = t.clientX - rect.left;
      var sy = t.clientY - rect.top;
      pointerDownPos = { x: sx, y: sy };
      pointerMoved = false;
      var hit = nodeAt(sx, sy);
      if (hit) {
        dragNode = hit;
        dragNode.fixed = true;
      } else {
        isPanning = true;
        panStart = { x: sx, y: sy };
        panOrigin = { x: transform.x, y: transform.y };
      }
      wake();
    }, { passive: true });

    canvas.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      var rect = canvas.getBoundingClientRect();
      var sx = t.clientX - rect.left;
      var sy = t.clientY - rect.top;

      if (Math.abs(sx - pointerDownPos.x) > CLICK_MOVE_THRESHOLD || Math.abs(sy - pointerDownPos.y) > CLICK_MOVE_THRESHOLD) {
        pointerMoved = true;
      }

      if (dragNode) {
        var w = screenToWorld(sx, sy);
        dragNode.x = w.x;
        dragNode.y = w.y;
        dragNode.vx = 0;
        dragNode.vy = 0;
        reheat();
      } else if (isPanning) {
        transform.x = panOrigin.x + (sx - panStart.x);
        transform.y = panOrigin.y + (sy - panStart.y);
        wake();
      }
    }, { passive: true });

    canvas.addEventListener('touchend', function () {
      if (dragNode) {
        var wasClick = !pointerMoved;
        dragNode.fixed = false;
        if (wasClick && dragNode.url) {
          window.location.href = dragNode.url;
        }
        dragNode = null;
      }
      isPanning = false;
      wake();
    });

    var resetBtn = document.getElementById('tag-graph-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        transform = { x: 0, y: 0, k: 1 };
        wake();
      });
    }

    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', resize);
    }

    resize();
    alpha = 1;
    wake();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToggle);
  } else {
    initToggle();
  }
})();
