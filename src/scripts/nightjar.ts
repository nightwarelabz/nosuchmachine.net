const explorer = document.querySelector<HTMLElement>("[data-explorer]");
if (explorer) {
  const tabs = Array.from(explorer.querySelectorAll<HTMLButtonElement>("[data-room-tab]"));
  const panels = Array.from(explorer.querySelectorAll<HTMLElement>("[data-room-panel]"));
  const tablist = explorer.querySelector<HTMLElement>('[role="tablist"]');
  const select = (tab: HTMLButtonElement, focus = false) => {
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
    }
    for (const panel of panels) {
      panel.hidden = panel.dataset.roomPanel !== tab.dataset.roomTab;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", `tab-${panel.dataset.roomPanel}`);
      panel.tabIndex = 0;
    }
    if (focus) tab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (event) => {
      let next: number | undefined;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); select(tabs[next], true); }
    });
  });
  if (tabs[0] && tablist) { select(tabs[0]); tablist.hidden = false; }
}
