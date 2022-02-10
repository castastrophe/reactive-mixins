  document.addEventListener('breakpoint-update', (event: any) => {
   const results: HTMLElement = document.querySelector("#container-results");
   const add: HTMLElement = document.querySelector("#container-add");
   const remove: HTMLElement = document.querySelector("#container-remove");
   const formatter = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
    const bps = event.detail?.all;
    results.innerText = formatter.format(bps);
    add.innerText = formatter.format(event.detail?.added);
    remove.innerText = formatter.format(event.detail?.removed);
  });