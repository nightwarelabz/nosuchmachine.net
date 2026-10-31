(function(){
  var form = document.getElementById('intakeForm');
  var err = document.getElementById('formErr');
  var outBox = document.getElementById('outputBox');
  var out = document.getElementById('intakeOutput');
  var copyBtn = document.getElementById('copyBtn');
  var copyStatus = document.getElementById('copyStatus');
  var cbom = document.getElementById('fCbom');
  var sarif = document.getElementById('fSarif');

  // Pricing cards pre-select the tier in the form.
  var links = document.querySelectorAll('[data-tier-link]');
  for (var i = 0; i < links.length; i++) {
    links[i].addEventListener('click', function(){
      var t = this.getAttribute('data-tier-link');
      if (t === 'small') {
        document.getElementById('tierSmall').checked = true;
      } else if (t === 'standard') {
        document.getElementById('tierStandard').checked = true;
        cbom.checked = true; sarif.checked = true;
      }
    });
  }
  // Standard tier includes CBOM + SARIF — reflect that when it's picked.
  document.getElementById('tierStandard').addEventListener('change', function(){
    if (this.checked) { cbom.checked = true; sarif.checked = true; }
  });

  function val(id){ var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var name = val('fName'), reportTo = val('fReportTo'), access = val('fAccess');
    if (!name || !reportTo || !access) {
      err.classList.add('show');
      outBox.classList.remove('show');
      return;
    }
    err.classList.remove('show');

    var tierEl = document.querySelector('input[name="tier"]:checked');
    var tier = tierEl ? tierEl.value : 'Not specified';
    var deliverables = ['Findings report (always included)', 'Raw JSON evidence files'];
    if (cbom.checked) deliverables.push('CycloneDX CBOM');
    if (sarif.checked) deliverables.push('SARIF');

    var lines = [
      'SNOOT PQC SCAN — INTAKE',
      '=======================',
      'Send via GitHub: https://github.com/nightwarelabz/snoot — or via Ko-fi: https://ko-fi.com/nightwarelabz',
      '',
      'Name: ' + name,
      'Send report to: ' + reportTo,
      'Tier: ' + tier,
      'Code access method: ' + access,
      'Codebase size: ' + (val('fSize') || 'Not specified'),
      'Languages: ' + (val('fLangs') || 'Not specified'),
      'Paths to exclude: ' + (val('fExclude') || 'None'),
      'Deliverables: ' + deliverables.join('; '),
      'Notes: ' + (val('fNotes') || 'None'),
      '',
      'Understood: source only (no production credentials, no customer data).',
      'Scope and price confirmed before any money moves; payment via Ko-fi (https://ko-fi.com/nightwarelabz) or other agreed means, arranged at booking.'
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
