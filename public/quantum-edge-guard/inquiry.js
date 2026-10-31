(function(){
  // Copy buttons for code blocks
  var copySmalls = document.querySelectorAll('[data-copy]');
  for (var i = 0; i < copySmalls.length; i++) {
    copySmalls[i].addEventListener('click', function(){
      var btn = this;
      var text = btn.getAttribute('data-copy');
      function done(){ var old = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(function(){ btn.textContent = old; }, 1600); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function(){ btn.textContent = 'Select & copy manually'; });
      }
    });
  }

  var form = document.getElementById('inquiryForm');
  var err = document.getElementById('formErr');
  var outBox = document.getElementById('outputBox');
  var out = document.getElementById('inquiryOutput');
  var copyBtn = document.getElementById('copyBtn');
  var copyStatus = document.getElementById('copyStatus');

  function val(id){ var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var name = val('fName'), contact = val('fContact');
    if (!name || !contact) {
      err.classList.add('show');
      outBox.classList.remove('show');
      return;
    }
    err.classList.remove('show');
    var lines = [
      'QUANTUM EDGE GUARD — LICENSE INQUIRY',
      '=====================================',
      'Name: ' + name,
      'Contact: ' + contact,
      'Machines to license: ' + (val('fMachines') || 'Not specified'),
      'Primary use: ' + (val('fUse') || 'Not specified'),
      'Notes: ' + (val('fNotes') || 'None'),
      '',
      'Product: Quantum Edge Guard (qeg) — NIGHTWARE LABZ',
      'Model: one-time license per machine + yearly update subscription.',
      'Pricing tiers are published with the first commercial release.',
      'Send via GitHub: https://github.com/nightwarelabz/quantum-edge-guard — or via Ko-fi: https://ko-fi.com/nightwarelabz'
    ];
    out.value = lines.join('\n');
    outBox.classList.add('show');
    copyStatus.textContent = '';
    outBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  copyBtn.addEventListener('click', function(){
    out.focus(); out.select();
    function done(){ copyStatus.textContent = 'Copied — ready to send.'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(out.value).then(done, function(){
        try { document.execCommand('copy'); done(); }
        catch(e){ copyStatus.textContent = 'Select the text above and copy it manually.'; }
      });
    } else {
      try { document.execCommand('copy'); done(); }
      catch(e){ copyStatus.textContent = 'Select the text above and copy it manually.'; }
    }
  });
})();
