// When the toolbar icon is clicked, open the poster UI in a full tab.
// A full tab stays open during the posting job (a popup would close).
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});
