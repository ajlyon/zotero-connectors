/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2011 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

/**
 * Functions for performing HTTP requests, both via XMLHTTPRequest and using a hidden browser
 * @namespace
 */
if(!Zotero.HTTP) Zotero.HTTP = {};

/**
 * Determines whether the page to be loaded has the same origin as the current page
 */
Zotero.HTTP.isSameOrigin = function(url) {
	const hostPortRe = /^(?:([^:]+):)\/\/([^\/]+)/i;
	var m = hostPortRe.exec(url);
	if(!m) {
		return true;
	} else {
		return m[0].toLowerCase() === window.location.protocol.toLowerCase() &&
			m[1].toLowerCase() === window.host.toLowerCase();
	}
}
 
/**
 * Load one or more documents in a hidden iframe
 *
 * @param {String|String[]} urls URL(s) of documents to load
 * @param {Function} processor Callback to be executed for each document loaded
 * @param {Function} done Callback to be executed after all documents have been loaded
 * @param {Function} exception Callback to be executed if an exception occurs
 */
Zotero.HTTP.processDocuments = function(urls, processor, done, exception, dontDelete) {
	var loadingURL;
	
	/**
	 * Removes event listener for the load event and deletes the hidden browser
	 */
	var removeListeners = function() {
		if("removeEventListener" in hiddenBrowser) {
			hiddenBrowser.removeEventListener("load", onFrameLoad, false);
		}
		if(!dontDelete) Zotero.Browser.removeHiddenBrowser(hiddenBrowser);
	}
	
	/**
	 * Loads the next page
	 * @inner
	 */
	var doLoad = function() {
		if(urls.length) {
			loadingURL = urls.shift();
			try {
				Zotero.debug("HTTP.processDocuments: Loading "+loadingURL);
				if(Zotero.HTTP.isSameOrigin(loadingURL)) {	
					hiddenBrowser.src = loadingURL;
				} else if(Zotero.isBookmarklet) {
					throw "Cross-site requests are not supported in the bookmarklet";
				} else {
					Zotero.HTTP.doGet(loadingURL, onCrossSiteLoad);
				}
			} catch(e) {
				if(exception) {
					try {
						exception(e);
					} catch(e) {
						Zotero.logError(e);
					}
					return;
				} else {
					Zotero.logError(e);
				}
				
				removeListeners();
			}
		} else {
			if(done) {
				try {
					done();
				} catch(e) {
					Zotero.logError(done);
				}
			}
			
			removeListeners();
		}
	};
	
	/**
	 * Process a loaded document
	 * @inner
	 */
	var process = function(newLoc, newDoc, newWin) {
		try {
			if(newLoc === "about:blank") return;
			Zotero.debug("HTTP.processDocuments: "+newLoc+" has been loaded");
			if(newLoc !== prevUrl) {	// Just in case it fires too many times
				prevUrl = newLoc;
				
				if(Zotero.isIE) {
					// ugh ugh ugh ugh
					installXPathIfNecessary(newWin);
				}
				
				try {
					processor(newDoc, newLoc);
				} catch(e) {
					Zotero.logError(e);
				}
				
				doLoad();
			}
		} catch(e) {
			if(exception) {
				try {
					exception(e);
				} catch(e) {
					Zotero.logError(e);
				}
			} else {
				Zotero.logError(e);
			}
			
			removeListeners();
			return;
		}
	}
	
	/**
	 * Callback to be executed when a page is retrieved via cross-site XHR
	 * @inner
	 */
	var onCrossSiteLoad = function(xmlhttp) {
		// add iframe
		var iframe = document.createElement("iframe");
		iframe.style.display = "none";
		// ban script execution
		iframe.setAttribute("sandbox", "allow-same-origin allow-forms");
		document.body.appendChild(iframe);
		
		// load cross-site data into iframe
		doc = iframe.contentDocument;
		doc.open();
		doc.write(xmlhttp.responseText);
		doc.close();
		process(loadingURL, doc, iframe.contentWindow);
	}
	
	/**
	 * Callback to be executed when a page load completes
	 * @inner
	 */
	var onFrameLoad = function() {
		var newWin = hiddenBrowser.contentWindow, newDoc, newLoc;
		try {
			newDoc = (newWin ? newWin.document : hiddenBrowser.contentDocument);
			newLoc = (newWin ? newWin.location : newDoc.location).toString();
		} catch(e) {
			e = "Same origin HTTP request redirected to a different origin not handled";
			
			if(exception) {
				try {
					exception(e);
				} catch(e) {
					Zotero.logError(e);
				}
			} else {
				Zotero.logError(e);
			}
			
			removeListeners();
			return;
		}
		
		process(newLoc, newDoc, newWin);
	};
	
	if(typeof(urls) == "string") urls = [urls];
	
	var prevUrl;
	
	var hiddenBrowser = Zotero.Browser.createHiddenBrowser();
	if(hiddenBrowser.addEventListener) {
		hiddenBrowser.addEventListener("load", onFrameLoad, false);
	} else {
		hiddenBrowser.attachEvent("onload", onFrameLoad);
	}
	
	doLoad();
	return hiddenBrowser;
}

Zotero.Browser = {
	"createHiddenBrowser":function() {
		var hiddenBrowser = document.createElement("iframe");
		hiddenBrowser.style.display = "none";
		document.body.appendChild(hiddenBrowser);
		return hiddenBrowser;
	},
	"deleteHiddenBrowser":function(hiddenBrowser) {
		document.body.removeChild(hiddenBrowser);
	}
}