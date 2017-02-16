/*!
 * Muuri v0.3.0-dev
 * https://github.com/haltu/muuri
 * Copyright (c) 2015, Haltu Oy
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/*

TODO v0.3.0
===========
* [x] BUG: When container has box-sizing border box the dimensions are not
      visually correct.
* [x] muuri.sendItem()
* [x] muuri.sortItems()
* [x] muuri.filterItems()
* [x] Improve muuri.getItems() to support filtering items by all available
      states.
* [x] Improve the the visibility handler method logic. If an item is already
      visible and muuri.showItems() is called for it, there should be no event
      triggered. The same applies to hidden items and muuri.hideItems() method.
* [x] When setting the width/height of container account for min-width/height
      and max-width/height.
* [x] Drag item between instances.
      * [x] Drop item on empty container.
      * [x] Don't support defining "from" index in sortPredicate.
      * [x] Get the related events and their arguments sorted out.
      * [x] Deprecate the builtin freeze/unfreeze methods -> let it for user
            to solve since it's a fix for a specific scenario.
* [x] Always consider the dragged element to be the item element. Get rid of
      the dragData.element and releaseData.element stuff.
* [x] Review the event names and data.
* [ ] Review and test the show and hide methods.
* [ ] Streamline codebase by trying to combine similar functions and methods
      into smaller reusable functions.
* [ ] Use WeakMap for storing the instances in browsers that support WeakMap.
* [ ] Review the codebase and comments with thought x 3.

*/

(function (global, factory) {

  var libName = 'Muuri';
  var Velocity;
  var Hammer;

  if (typeof define === 'function' && define.amd) {

    define(function (require) {
      Velocity = require.defined && require.defined('velocity') ? require('velocity') : undefined;
      Hammer = require.defined && require.defined('hammer') ? require('hammer') : undefined;
      return factory(global, libName, Velocity, Hammer);
    });

  }
  else if (typeof module === 'object' && module.exports) {

    try {
      Velocity = require('velocity-animate');
    }
    catch (e) {}

    try {
      Hammer = require('hammerjs');
    }
    catch (e) {}

    module.exports = factory(global, libName, Velocity, Hammer);

  }
  else {

    Velocity = typeof global.jQuery === 'function' ? global.jQuery.Velocity : global.Velocity;
    Hammer = global.Hammer;
    global[libName] = factory(global, libName, Velocity, Hammer);

  }

}(this, function (global, libName, Velocity, Hammer, undefined) {

  'use strict';

  // Get references to all the stuff we are using from the global scope.
  var document = global.document;
  var Object = global.Object;
  var Array = global.Array;
  var Math = global.Math;
  var Error = global.Error;
  var Element = global.Element;

  // Container object for keeping track of Container instances.
  var containerInstances = {};

  // Container object for keeping track of Item instances.
  var itemInstances = {};

  // Container object for keeping track of the drag sort groups.
  var sortGroups = {};

  // Id which is used for Muuri instances and Item instances. Incremented every
  // time it is used.
  var uuid = 0;

  // Get the supported element.matches().
  var elementMatches = getSupportedElementMatches();

  // Get the supported transform style property.
  var transform = getSupportedStyle('transform');

  // Do transformed elements leak fixed elements? According W3C specification
  // (about transform rendering) a transformed element should contain fixed
  // elements, but not every browser follows the spec. So we need to test it.
  var transformLeaksFixed = doesTransformLeakFixed();

  // Event names.
  var evRefresh = 'refresh';
  var evRefreshItems = 'refreshItems';
  var evSynchronizeItems = 'synchronizeItems';
  var evLayoutItemsStart = 'layoutItemsStart';
  var evLayoutItemsEnd = 'layoutItemsEnd';
  var evAddItems = 'addItems';
  var evRemoveItems = 'removeItems';
  var evShowItemsStart = 'showItemsStart';
  var evShowItemsEnd = 'showItemsEnd';
  var evHideItemsStart = 'hideItemsStart';
  var evHideItemsEnd = 'hideItemsEnd';
  var evMoveItem = 'moveItem';
  var evSendItem = 'sendItem';
  var evReceiveItemStart = 'receiveItemStart';
  var evReceiveItemEnd = 'receiveItemEnd';
  var evDragStart = 'dragStart';
  var evDragMove = 'dragMove';
  var evDragScroll = 'dragScroll';
  var evDragSort = 'dragSort';
  var evDragSend = 'dragSend';
  var evDragReceive = 'dragReceive';
  var evDragReceiveDrop = 'dragReceiveDrop';
  var evDragEnd = 'dragEnd';
  var evDragReleaseStart = 'dragReleaseStart';
  var evDragReleaseEnd = 'dragReleaseEnd';
  var evDestroy = 'destroy';

  /**
   * Container
   * *********
   */

  /**
   * Creates a new Container instance.
   *
   * @public
   * @class
   * @param {Object} settings
   * @param {HTMLElement} settings.container
   * @param {Array|NodeList} settings.items
   * @param {?Function|Object} [settings.show]
   * @param {Number} [settings.show.duration=300]
   * @param {String} [settings.show.easing="ease"]
   * @param {Object} [settings.show.styles]
   * @param {?Function|Object} [settings.hide]
   * @param {Number} [settings.hide.duration=300]
   * @param {String} [settings.hide.easing="ease"]
   * @param {Object} [settings.hide.styles]
   * @param {Function|Object} [settings.layout]
   * @param {Boolean} [settings.layout.fillGaps=false]
   * @param {Boolean} [settings.layout.horizontal=false]
   * @param {Boolean} [settings.layout.alignRight=false]
   * @param {Boolean} [settings.layout.alignBottom=false]
   * @param {Boolean|Number} [settings.layoutOnResize=100]
   * @param {Boolean} [settings.layoutOnInit=true]
   * @param {Number} [settings.layoutDuration=300]
   * @param {String} [settings.layoutEasing="ease"]
   * @param {Boolean} [settings.dragEnabled=false]
   * @param {?HtmlElement} [settings.dragContainer=null]
   * @param {?Function} [settings.dragStartPredicate=null]
   * @param {Boolean} [settings.dragSort=true]
   * @param {Number} [settings.dragSortInterval=50]
   * @param {?Function|Object} [settings.dragSortPredicate]
   * @param {Number} [settings.dragSortPredicate.threshold=50]
   * @param {String} [settings.dragSortPredicate.action="move"]
   * @param {?String} [settings.dragSortGroup=null]
   * @param {?Array} [settings.dragSortConnections=null]
   * @param {Number} [settings.dragReleaseDuration=300]
   * @param {String} [settings.dragReleaseEasing="ease"]
   * @param {String} [settings.containerClass="muuri"]
   * @param {String} [settings.itemClass="muuri-item"]
   * @param {String} [settings.itemVisibleClass="muuri-item-visible"]
   * @param {String} [settings.itemHiddenClass="muuri-item-hidden"]
   * @param {String} [settings.itemPositioningClass="muuri-item-positioning"]
   * @param {String} [settings.itemDraggingClass="muuri-item-dragging"]
   * @param {String} [settings.itemReleasingClass="muuri-item-releasing"]
   */
  function Container(settings) {

    var inst = this;
    var debouncedLayout;

    // Merge user settings with default settings.
    var stn = inst._settings = mergeSettings(Container.defaultSettings, settings);

    // Make sure a valid container element is provided before going continuing.
    if (!document.body.contains(stn.container)) {
      throw new Error('Container must be an existing DOM element');
    }

    // Create instance id and store it to the container instances collection.
    inst._id = ++uuid;
    containerInstances[inst._id] = inst;

    // Setup container element.
    inst._element = stn.container;
    addClass(stn.container, stn.containerClass);

    // Reference to the currently used Layout instance.
    inst._layout = null;

    // Create private Emitter instance.
    inst._emitter = new Container.Emitter();

    // Setup show and hide animations for items.
    inst._itemShowHandler = typeof stn.show === 'function' ? stn.show() : getItemVisbilityHandler('show', stn.show);
    inst._itemHideHandler = typeof stn.hide === 'function' ? stn.hide() : getItemVisbilityHandler('hide', stn.hide);

    // Setup instance's sort group.
    inst._setSortGroup(stn.dragSortGroup);

    // Setup instance's sort connections.
    inst._sortConnections = Array.isArray(stn.dragSortConnections) && stn.dragSortConnections.length ? stn.dragSortConnections : null;

    // Calculate container element's initial dimensions and offset.
    inst.refresh();

    // Setup initial items.
    inst._items = Array.prototype.slice.call(stn.items).map(function (element) {
      return new Container.Item(inst, element);
    });

    // Layout on window resize if the layoutOnResize option is enabled.
    if (typeof stn.layoutOnResize === 'number' || stn.layoutOnResize === true) {

      debouncedLayout = debounce(function () {
        inst.refresh().refreshItems().layoutItems();
      }, Math.max(0, parseInt(stn.layoutOnResize) || 0));

      inst._resizeHandler = function () {
        debouncedLayout();
      };

      global.addEventListener('resize', inst._resizeHandler);

    }

    // Do initial layout if necessary.
    if (stn.layoutOnInit) {
      inst.layoutItems(true);
    }

  }

  /**
   * Container - Public properties
   * *****************************
   */

  /**
   * @see Item
   */
  Container.Item = Item;

  /**
   * @see Drag
   */
  Container.Drag = Drag;

  /**
   * @see Layout
   */
  Container.Layout = Layout;

  /**
   * @see Animate
   */
  Container.AnimateLayout = Animate;

  /**
   * @see Animate
   */
  Container.AnimateVisibility = Animate;

  /**
   * @see Emitter
   */
  Container.Emitter = Emitter;

  /**
   * Default settings for Container instance.
   *
   * @public
   * @memberof Container
   */
  Container.defaultSettings = {

    // Container
    container: null,

    // Items
    items: [],

    // Show/hide animations
    show: {
      duration: 300,
      easing: 'ease',
      styles: {
        opacity: 1,
        scale: 1
      }
    },
    hide: {
      duration: 300,
      easing: 'ease',
      styles: {
        opacity: 0,
        scale: 0.5
      }
    },

    // Layout
    layout: {
      fillGaps: false,
      horizontal: false,
      alignRight: false,
      alignBottom: false
    },
    layoutOnResize: 100,
    layoutOnInit: true,
    layoutDuration: 300,
    layoutEasing: 'ease',

    // Drag & Drop
    dragEnabled: false,
    dragContainer: null,
    dragStartPredicate: null,
    dragSort: true,
    dragSortInterval: 50,
    dragSortPredicate: {
      threshold: 50,
      action: 'move'
    },
    dragSortGroup: null,
    dragSortConnections: null,
    dragReleaseDuration: 300,
    dragReleaseEasing: 'ease',

    // Classnames
    containerClass: 'muuri',
    itemClass: 'muuri-item',
    itemVisibleClass: 'muuri-item-shown',
    itemHiddenClass: 'muuri-item-hidden',
    itemPositioningClass: 'muuri-item-positioning',
    itemDraggingClass: 'muuri-item-dragging',
    itemReleasingClass: 'muuri-item-releasing'

  };

  /**
   * Container - Public prototype methods
   * ************************************
   */

  /**
   * Bind an event listener.
   *
   * @public
   * @memberof Container.prototype
   * @param {String} event
   * @param {Function} listener
   * @returns {Container}
   */
  Container.prototype.on = function (event, listener) {

    this._emitter.on(event, listener);
    return this;

  };

  /**
   * Unbind an event listener.
   *
   * @public
   * @memberof Container.prototype
   * @param {String} event
   * @param {Function} listener
   * @returns {Container}
   */
  Container.prototype.off = function (event, listener) {

    this._emitter.off(event, listener);
    return this;

  };

  /**
   * Calculate and cache the dimensions and offsets of the container element.
   *
   * @public
   * @memberof Container.prototype
   * @returns {Container}
   */
  Container.prototype.refresh = function () {

    var inst = this;
    var element = inst._element;
    var rect = element.getBoundingClientRect();
    var sides;
    var side;
    var i;

    // Update width and height.
    inst._width = Math.round(rect.width);
    inst._height = Math.round(rect.height);

    // Update offset.
    inst._offset = inst._offset || {};
    inst._offset.left = Math.round(rect.left);
    inst._offset.top = Math.round(rect.top);

    // Update borders and paddings.
    inst._border = inst._border || {};
    inst._padding = inst._padding || {};
    sides = ['left', 'right', 'top', 'bottom'];
    for (i = 0; i < sides.length; i++) {
      side = sides[i];
      inst._border[side] = Math.round(getStyleAsFloat(element, 'border-' + side + '-width'));
      inst._padding[side] = Math.round(getStyleAsFloat(element, 'padding-' + side));
    }

    // Update box-sizing.
    inst._boxSizing = getStyle(element, 'box-sizing');

    // Emit refresh event.
    inst._emitter.emit(evRefresh);

    return inst;

  };

  /**
   * Get the instance element.
   *
   * @public
   * @memberof Container.prototype
   * @returns {HTMLElement}
   */
  Container.prototype.getElement = function () {

    return this._element;

  };

  /**
   * Get instance's cached dimensions and offsets. Basically the same data as
   * provided by element.getBoundingClientRect() method, just cached. The cached
   * dimensions and offsets are subject to change whenever layoutItems or
   * refresh method is called. Note that all returned values are rounded.
   *
   * @public
   * @memberof Container.prototype
   * @returns {Object}
   */
  Container.prototype.getRect = function () {

    return {
      width: this._width,
      height: this._height,
      left: this._offset.left,
      right: this._offset.left + this._width,
      top: this._offset.top,
      bottom: this._offset.top + this._height
    };

  };

  /**
   * Get all items. Optionally you can provide specific targets (indices or
   * elements) and filter the results by the items' state (active/inactive).
   * Note that the returned array is not the same object used by the instance so
   * modifying it will not affect instance's items. All items that are not found
   * are omitted from the returned array.
   *
   * @public
   * @memberof Container.prototype
   * @param {Array|HTMLElement|Item|NodeList|Number} [targets]
   * @param {String} [state]
   *   - Allowed values are: "active", "inactive", "visible", "hidden",
   *     "showing", "hiding", "positioning", "dragging", "releasing" and
   *     "migrating".
   * @returns {Array}
   *   - Array of Item instances.
   */
  Container.prototype.getItems = function (targets, state) {

    var inst = this;
    var hasTargets = targets && typeof targets !== 'string';
    var targetItems = !hasTargets ? null : isNodeList(targets) ? Array.prototype.slice.call(targets) : [].concat(targets);
    var targetState = !hasTargets ? targets : state;
    var ret = [];
    var item;
    var i;

    // Sanitize target state.
    targetState = typeof targetState === 'string' ? targetState : null;

    // If target state or target items are defined return filtered results.
    if (targetState || targetItems) {
      targetItems = targetItems || inst._items;
      for (i = 0; i < targetItems.length; i++) {
        item = hasTargets ? inst._getItem(targetItems[i]) : targetItems[i];
        if (item && (!targetState || isItemInState(item, targetState))) {
          ret[ret.length] = item;
        }
      }
      return ret;
    }

    // Otherwise return all items.
    else {
      return ret.concat(inst._items);
    }

  };

  /**
   * Recalculate the width and height of the provided targets. If no targets are
   * provided all active items will be refreshed.
   *
   * @public
   * @memberof Container.prototype
   * @param {Array|HTMLElement|Item|Number} [items]
   * @returns {Container}
   */
  Container.prototype.refreshItems = function (items) {

    var inst = this;
    var targetItems = inst.getItems(items || 'active');
    var i;

    for (i = 0; i < targetItems.length; i++) {
      targetItems[i]._refresh();
    }

    // Emit refreshItems event.
    inst._emitter.emit(evRefreshItems, targetItems);

    return inst;

  };

  /**
   * Order the item elements to match the order of the items. If the item's
   * element is not a child of the container it is ignored and left untouched.
   * This comes handy if you need to keep the DOM structure matched with the
   * order of the items.
   *
   * @public
   * @memberof Container.prototype
   * @returns {Container}
   */
  Container.prototype.synchronizeItems = function () {

    var inst = this;
    var container = inst._element;
    var items = inst._items;
    var fragment;
    var element;
    var i;

    // Append all elements in order to the container element.
    if (items.length) {
      for (i = 0; i < items.length; i++) {
        element = items[i]._element;
        if (element.parentNode === container) {
          fragment = fragment || document.createDocumentFragment();
          fragment.appendChild(element);
        }
      }
      if (fragment) {
        container.appendChild(fragment);
      }
    }

    // Emit synchronizeItems event.
    inst._emitter.emit(evSynchronizeItems);

    return inst;

  };

  /**
   * Calculate and apply Container instance's item positions.
   *
   * @public
   * @memberof Container.prototype
   * @param {Boolean} [instant=false]
   * @param {Function} [callback]
   * @returns {Container}
   */
  Container.prototype.layoutItems = function (instant, callback) {

    var inst = this;
    var emitter = inst._emitter;
    var cb = typeof instant === 'function' ? instant : callback;
    var isInstant = instant === true;
    var layout = new Container.Layout(inst);
    var counter = 0;
    var itemsLength = layout.items.length;
    var completed = [];
    var rect;
    var padding;
    var border;
    var isBorderBox;
    var item;
    var position;
    var i;

    // Try to finish the layout procedure.
    function tryFinish(interrupted, item) {

      // Push all items to the completed items array which were not interrupted.
      if (!interrupted) {
        completed[completed.length] = item;
      }

      // After all items have finished their animations call callback and emit
      // layoutend event.
      if (++counter === itemsLength) {
        if (typeof cb === 'function') {
          cb(completed.concat());
        }
        emitter.emit(evLayoutItemsEnd, completed.concat());
      }

    }

    // Update the current layout data reference.
    inst._layout = layout;

    // Emit layoutItemsStart event.
    emitter.emit(evLayoutItemsStart, layout.items.concat());

    // If container's width or height was modified, we need refresh it's cached
    // dimensions. Also keep in mind that container's cached width/height should
    // always equal to what elem.getBoundingClientRect() would return, so
    // therefore we need to add the container's paddings and margins to the
    // dimensions if it's box-sizing is border-box.
    if (layout.setWidth || layout.setHeight) {

      padding = inst._padding;
      border = inst._border;
      isBorderBox = inst._boxSizing === 'border-box';

      // Set container's height if needed.
      if (layout.setHeight) {
        setStyles(inst._element, {
          height: (isBorderBox ? layout.height + padding.top + padding.bottom + border.top + border.bottom : layout.height) + 'px'
        });
      }

      // Set container's width if needed.
      if (layout.setWidth) {
        setStyles(inst._element, {
          width: (isBorderBox ? layout.width + padding.left + padding.right + border.left + border.right : layout.width) + 'px'
        });
      }

      // Get the instance's dimensions with elem.getBoundingClientRect() to
      // account for the possible min/max-width/height.
      rect = inst._element.getBoundingClientRect();
      inst._width = Math.round(rect.width);
      inst._height = Math.round(rect.height);

    }

    // If there are no items let's finish quickly.
    if (!itemsLength) {
      tryFinish(true);
    }

    // If there are items let's position them.
    else {

      for (i = 0; i < layout.items.length; i++) {

        item = layout.items[i];
        position = layout.slots[item._id];

        // Update item's position.
        item._left = position.left + inst._padding.left;
        item._top = position.top + inst._padding.top;

        // Layout non-dragged items.
        if (item._drag && item._drag._dragData.isActive) {
          tryFinish(false, item);
        }
        else {
          item._layout(isInstant, tryFinish);
        }

      }

    }

    return inst;

  };

  /**
   * Add new items by providing the elements you wish to add to the instance and
   * optionally provide the index where you want the items to be inserted into.
   * All elements that are not already children of the container element will be
   * automatically appended to the container. If an element has it's CSS display
   * property set to none it will be marked as inactive during the initiation
   * process. As long as the item is inactive it will not be part of the layout,
   * but it will retain it's index. You can activate items at any point
   * with muuri.show() method. This method will automatically call
   * muuri.layoutItems() if one or more of the added elements are visible. If
   * only hidden items are added no layout will be called. All the new visible
   * items are positioned without animation during their first layout.
   *
   * @public
   * @memberof Container.prototype
   * @param {Array|HTMLElement} elements
   * @param {Number} [index=-1]
   * @returns {Array}
   *   - Array of the new Item instances.
   */
  Container.prototype.addItems = function (elements, index) {

    var inst = this;
    var targetElements = [].concat(elements);
    var newItems = [];
    var items = inst._items;
    var needsRelayout = false;
    var elementIndex;
    var item;
    var i;

    // Filter out all elements that exist already in current instance.
    for (i = 0; i < items.length; i++) {
      elementIndex = targetElements.indexOf(items[i]._element);
      if (elementIndex > -1) {
        targetElements.splice(elementIndex, 1);
      }
    }

    // Return early if there are no valid items.
    if (!targetElements.length) {
      return newItems;
    }

    // Create new items.
    for (i = 0; i < targetElements.length; i++) {
      item = new Container.Item(inst, targetElements[i]);
      newItems[newItems.length] = item;
      if (item._isActive) {
        needsRelayout = true;
        item._noLayoutAnimation = true;
      }
    }

    // Add the new items to the items collection to correct index.
    insertItemsToArray(items, newItems, index);

    // Emit addItems event.
    inst._emitter.emit(evAddItems, newItems.concat());

    // If relayout is needed.
    if (needsRelayout) {
      inst.layoutItems();
    }

    // Return new items.
    return newItems;

  };

  /**
   * Remove items from the instance.
   *
   * @public
   * @memberof Container.prototype
   * @param {Array|HTMLElement|Item|Number} items
   * @param {Boolean} [removeElement=false]
   * @returns {Array}
   *   - The indices of removed items.
   */
  Container.prototype.removeItems = function (items, removeElement) {

    var inst = this;
    var targetItems = inst.getItems(items);
    var indices = [];
    var needsRelayout = false;
    var item;
    var i;

    // Remove the individual items.
    for (i = 0; i < targetItems.length; i++) {
      item = targetItems[i];
      if (item._isActive) {
        needsRelayout = true;
      }
      indices[indices.length] = item._destroy(removeElement);
    }

    // Emit removeItems event.
    inst._emitter.emit(evRemoveItems, indices.concat());

    // If relayout is needed.
    if (needsRelayout) {
      inst.layoutItems();
    }

    return indices;

  };

  /**
   * Show instance items.
   *
   * @public
   * @memberof Container.prototype
   * @param {Array|HTMLElement|Item|Number} items
   * @param {Boolean} [instant=false]
   * @param {Function} [callback]
   * @returns {Container}
   */
  Container.prototype.showItems = function (items, instant, callback) {

    setVisibility(this, 'show', items, instant, callback);
    return this;

  };

  /**
   * Hide instance items.
   *
   * @public
   * @memberof Container.prototype
   * @param {Array|HTMLElement|Item|Number} items
   * @param {Boolean} [instant=false]
   * @param {Function} [callback]
   * @returns {Container}
   */
  Container.prototype.hideItems = function (items, instant, callback) {

    setVisibility(this, 'hide', items, instant, callback);
    return this;

  };

  /**
   * Sort items with a compare function. Works identically to
   * Array.prototype.sort().
   *
   * @public
   * @memberof Container.prototype
   * @param {Function} compareFn
   * @returns {Container}
   */
  Container.prototype.sortItems = function (compareFn) {

    var items = this._items;

    if (items.length > 1) {
      items.sort(compareFn);
    }

    return this;

  };

  /**
   * Filter items. Expects one argument which should be either a function or a
   * string. A function filter is executed for every item in the instance. If
   * the return value of the function is truthy the item in question will be
   * shown and otherwise hidden. The filter function receives two arguments: the
   * item instance and the related element. If the filter is a string it is
   * considered to be a selector and it is checked against every item element in
   * the instance with the native element.matches() method. All the items which
   * the selector matches will be shown and other hidden.
   *
   * @public
   * @memberof Container.prototype
   * @param {Function|String} filter
   * @param {Boolean} [instant=false]
   * @returns {Container}
   */
  Container.prototype.filterItems = function (filter, instant) {

    var inst = this;
    var items = inst._items;
    var filterType = typeof filter;
    var isFilterString = filterType === 'string';
    var isFilterFn = filterType === 'function';
    var itemsToShow = [];
    var itemsToHide = [];
    var item;
    var i;

    // Return immediately if there are no items.
    if (!items.length) {
      return inst;
    }

    // Check which items need to be shown and which hidden.
    if (isFilterFn || isFilterString) {
      for (i = 0; i < items.length; i++) {
        item = items[i];
        if (isFilterFn ? filter(item, item._element) : elementMatches(item._element, filter)) {
          itemsToShow.push(item);
        }
        else {
          itemsToHide.push(item);
        }
      }
    }

    // Show items that need to be shown.
    if (itemsToShow.length) {
      inst.showItems(itemsToShow, instant);
    }

    // Hide items that need to be hidden.
    if (itemsToHide.length) {
      inst.hideItems(itemsToHide, instant);
    }

    return inst;

  };

  /**
   * Move item to another index or in place of another item.
   *
   * @public
   * @memberof Container.prototype
   * @param {HTMLElement|Item|Number} item
   * @param {HTMLElement|Item|Number} position
   * @param {String} [action="move"]
   *   - Accepts either "move" or "swap". "move" moves item in place of another
   *     item and "swap" swaps position of items.
   * @returns {Container}
   */
  Container.prototype.moveItem = function (item, position, action) {

    var inst = this;
    var items = inst._items;
    var fromItem;
    var toItem;
    var fromIndex;
    var toIndex;
    var isSwap;

    // Return immediately, if moving item is not possible.
    if (items.length < 2) {
      return inst;
    }

    fromItem = inst._getItem(item);
    toItem = inst._getItem(position);
    isSwap = action === 'swap';
    action = isSwap ? 'swap' : 'move';

    // Make sure the items exist and are not the same.
    if (fromItem && toItem && (fromItem !== toItem)) {

      // Get the indexes of the items.
      fromIndex = items.indexOf(fromItem);
      toIndex = items.indexOf(toItem);

      // Do the move/swap.
      (isSwap ? arraySwap : arrayMove)(items, fromIndex, toIndex);

      // Emit moveItem event.
      inst._emitter.emit(evMoveItem, {
        item: fromItem,
        fromIndex: fromIndex,
        toIndex: toIndex,
        action: action
      });

      // Layout items.
      inst.layoutItems();

    }

    return inst;

  };

  /**
   * Send item to another Container instance.
   *
   * @public
   * @memberof Container.prototype
   * @param {Object} options
   * @param {HTMLElement|Item|Number} options.item
   * @param {Container} options.container
   * @param {HTMLElement|Item|Number} [options.position=0]
   * @param {Boolean} [options.appendTo=document.body]
   * @param {Boolean} [options.instant=false]
   * @returns {Container}
   */
  Container.prototype.sendItem = function (options) {

    var currentContainer = this;
    var currentContainerStn = currentContainer._settings;
    var targetContainer = options.container;
    var targetContainerStn = targetContainer._settings;
    var item = currentContainer._getItem(options.item);
    var migrate = item._migrate;
    var element = item._element;
    var isActive = item.isActive();
    var isVisible = (item.isVisible() || item.isShowing()) && !item.isHiding();
    var isInstant = !!options.instant;
    var appendTo = options.appendTo || document.body;
    var position = options.position;
    var currentIndex = currentContainer._items.indexOf(item);
    var newIndex = typeof position === 'number' ? position : (position ? targetContainer._items.indexOf(targetContainer._getItem(position)) : 0);
    var offsetDiff;
    var translateX;
    var translateY;

    // Stop current layout animation.
    item._stopLayout(true);

    // Stop current migration.
    item._stopMigrate(true);

    // Stop current visibility animations.
    currentContainer._itemShowHandler.stop(item);
    currentContainer._itemHideHandler.stop(item);

    // Destroy current drag.
    if (item._drag) {
      item._drag.destroy();
    }

    // Destroy current animation handlers.
    item._animate.destroy();
    item._animateChild.destroy();

    // Process current visibility animation queue.
    processQueue(item._visibilityQueue, true, item);

    // Remove current classnames.
    removeClass(element, currentContainerStn.itemClass);
    removeClass(element, currentContainerStn.itemVisibleClass);
    removeClass(element, currentContainerStn.itemHiddenClass);

    // Add new classnames.
    addClass(element, targetContainerStn.itemClass);
    addClass(element, isVisible ? targetContainerStn.itemVisibleClass : targetContainerStn.itemHiddenClass);

    // Move item instance from current container to target container.
    currentContainer._items.splice(currentIndex, 1);
    insertItemsToArray(targetContainer._items, item, newIndex);

    // Update item's container id reference.
    item._containerId = targetContainer._id;

    // Instantiate new animation controllers.
    item._animate = new Container.AnimateLayout(item, element);
    item._animateChild = new Container.AnimateVisibility(item, item._child);
    item._isDefaultAnimate = item._animate instanceof Animate;
    item._isDefaultChildAnimate = item._animateChild instanceof Animate;

    // If the item is currently not inside the correct layout container, we need
    // to move the element inside the layout container and calculate how much
    // the translate value needs to be modified in order for the item remain
    // visually in the same position. Note that we assume here that the item
    // is currently within the current container instance's element.
    if (currentContainer._element !== appendTo) {

      // Get current translate values.
      translateX = getTranslateAsFloat(element, 'x');
      translateY = getTranslateAsFloat(element, 'y');

      // Move the item inside the new container.
      appendTo.appendChild(element);

      // Calculate how much offset difference the new container has with the
      // old container and adjust the translate value accordingly.
      offsetDiff = getContainerOffsetDiff(element, currentContainer._element);
      translateX += offsetDiff.left;
      translateY += offsetDiff.top;

      // Calculate how much offset difference there is between the new container
      // and the target container and store the results to migration data.
      offsetDiff = getContainerOffsetDiff(element, targetContainer._element);
      migrate.containerDiffX = offsetDiff.left;
      migrate.containerDiffY = offsetDiff.top;

      // Update translate styles.
      setStyles(element, {
        transform: 'translateX(' + translateX + 'px) translateY(' + translateY + 'px)'
      });
    }

    // Update display styles.
    setStyles(element, {
      display: isVisible ? 'block' : 'hidden'
    });

    // Update child element's styles to reflect the current visibility state.
    item._child.removeAttribute('style');
    if (isVisible) {
      targetContainer._itemShowHandler.start(item, true);
    }
    else {
      targetContainer._itemHideHandler.start(item, true);
    }

    // Refresh item's dimensions, because they might have changed with the
    // addition of the new classnames.
    item._refresh();

    // Recreate item's drag handler.
    item._drag = targetContainerStn.dragEnabled ? new Container.Drag(item) : null;

    // Setup migration data.
    migrate.isActive = true;
    migrate.appendTo = appendTo;
    migrate.fromContainer = currentContainer;
    migrate.fromIndex = currentIndex;
    migrate.toIndex = newIndex;

    // Emit sendItem event.
    currentContainer._emitter.emit(evSendItem, {
      item: item,
      fromIndex: currentIndex,
      toContainer: targetContainer,
      toIndex: newIndex
    });

    // Emit receiveItemStart event.
    targetContainer._emitter.emit(evReceiveItemStart, {
      item: item,
      fromContainer: currentContainer,
      fromIndex: currentIndex,
      toIndex: newIndex
    });

    // Do layout for both containers if the item is active.
    if (isActive) {
      currentContainer.layoutItems(isInstant);
      targetContainer.layoutItems(isInstant);
    }

    return currentContainer;

  };

  /**
   * Destroy the instance.
   *
   * @public
   * @memberof Container.prototype
   * @param {Boolean} [removeElement=false]
   */
  Container.prototype.destroy = function (removeElement) {

    var inst = this;
    var container = inst._element;
    var items = inst._items.concat();
    var i;

    // Unbind window resize event listener.
    if (inst._resizeHandler) {
      global.removeEventListener('resize', inst._resizeHandler);
    }

    // Destroy items.
    for (i = 0; i < items.length; i++) {
      items[i]._destroy(removeElement);
    }

    // Unset sort group.
    inst._unsetSortGroup();

    // Restore container.
    removeClass(container, inst._settings.containerClass);
    setStyles(container, {
      height: ''
    });

    // Emit destroy event and unbind all events.
    inst._emitter.emit(evDestroy).destroy();

    // Remove reference from the container instances collection.
    containerInstances[inst._id] = undefined;

    // Nullify instance properties.
    nullifyInstance(inst, Container);

  };

  /**
   * Container - Protected prototype methods
   * ***************************************
   */

  /**
   * Get instance's item by element or by index. Target can also be an Item
   * instance in which case the function returns the item if it exists within
   * related Container instance. If nothing is found with the provided target,
   * null is returned.
   *
   * @protected
   * @memberof Container.prototype
   * @param {HTMLElement|Item|Number} [target=0]
   * @returns {?Item}
   */
  Container.prototype._getItem = function (target) {

    var inst = this;
    var index;
    var ret;
    var item;
    var i;

    // If no target is specified, return the first item or null.
    if (!target) {
      return inst._items[0] || null;
    }

    // If the target is instance of Item return it if it is attached to this
    // Container instance, otherwise return null.
    else if (target instanceof Item) {
      return target._containerId === inst._id ? target : null;
    }

    // If target is number return the item in that index. If the number is lower
    // than zero look for the item starting from the end of the items array. For
    // example -1 for the last item, -2 for the second last item, etc.
    else if (typeof target === 'number') {
      index = target > -1 ? target : inst._items.length + target;
      return inst._items[index] || null;
    }

    // In other cases let's assume that the target is an element, so let's try
    // to find an item that matches the element and return it. If item is not
    // found return null.
    else {
      ret = null;
      for (i = 0; i < inst._items.length; i++) {
        item = inst._items[i];
        if (item._element === target) {
          ret = item;
          break;
        }
      }
      return ret;
    }

  };

  /**
   * Set instance's drag sort group.
   *
   * @protected
   * @memberof Container.prototype
   * @param {?String} sortGroup
   * @returns {Container}
   */
  Container.prototype._setSortGroup = function (sortGroup) {

    var inst = this;

    inst._sortGroup = null;
    if (sortGroup && typeof sortGroup === 'string') {
      inst._sortGroup = sortGroup;
      if (!sortGroups[sortGroup]) {
        sortGroups[sortGroup] = [];
      }
      sortGroups[sortGroup].push(inst._id);
    }

    return inst;

  };

  /**
   * Unset instance's drag sort group.
   *
   * @protected
   * @memberof Container.prototype
   * @returns {Container}
   */
  Container.prototype._unsetSortGroup = function () {

    var inst = this;
    var sortGroup = inst._sortGroup;
    var sortGroupItems;
    var i;

    if (sortGroup) {
      sortGroupItems = sortGroups[sortGroup];
      for (i = 0; i < sortGroupItems.length; i++) {
        if (sortGroupItems[i] === inst._id) {
          sortGroupItems.splice(i, 1);
          break;
        }
      }
      inst._sortGroup = null;
    }

    return inst;

  };

  /**
   * Get connected Container instances.
   *
   * @protected
   * @memberof Container.prototype
   * @param {Boolean} [includeSelf=false]
   * @returns {Array}
   */
  Container.prototype._getSortConnections = function (includeSelf) {

    var inst = this;
    var ret = includeSelf ? [inst] : [];
    var connections = inst._sortConnections;
    var sortGroup;
    var containerId;
    var ii;
    var i;

    if (connections && connections.length) {
      for (i = 0; i < connections.length; i++) {
        sortGroup = sortGroups[connections[i]];
        if (sortGroup && sortGroup.length) {
          for (ii = 0; ii < sortGroup.length; ii++) {
            containerId = sortGroup[ii];
            if (containerId !== inst._id) {
              ret.push(containerInstances[containerId]);
            }
          }
        }
      }
    }

    return ret;

  };

  /**
   * Item
   * ****
   */

  /**
   * Creates a new Item instance for Container instance.
   *
   * @public
   * @class
   * @param {Container} container
   * @param {HTMLElement} element
   */
  function Item(container, element) {

    var inst = this;
    var stn = container._settings;
    var isHidden;

    // Create instance id and add item to the itemInstances collection.
    inst._id = ++uuid;
    itemInstances[inst._id] = inst;

    // If the provided item element is not a direct child of the grid container
    // element, append it to the grid container.
    if (element.parentNode !== container._element) {
      container._element.appendChild(element);
    }

    // Set item class.
    addClass(element, stn.itemClass);

    // Check if the element is hidden.
    isHidden = getStyle(element, 'display') === 'none';

    // Set visible/hidden class.
    addClass(element, isHidden ? stn.itemHiddenClass : stn.itemVisibleClass);

    // Refrence to connected Container instance's id.
    inst._containerId = container._id;

    // The elements.
    inst._element = element;
    inst._child = element.children[0];

    // Initiate item's animation controllers.
    inst._animate = new Container.AnimateLayout(inst, element);
    inst._animateChild = new Container.AnimateVisibility(inst, inst._child);

    // Check if default animation engine is used.
    inst._isDefaultAnimate = inst._animate instanceof Animate;
    inst._isDefaultChildAnimate = inst._animateChild instanceof Animate;

    // Set up active state (defines if the item is considered part of the layout
    // or not).
    inst._isActive = isHidden ? false : true;

    // Set up positioning state (defines if the item is currently animating
    // it's position).
    inst._isPositioning = false;

    // Set up visibility states.
    inst._isHidden = isHidden;
    inst._isHiding = false;
    inst._isShowing = false;

    // Visibility animation callback queue. Whenever a callback is provided for
    // show/hide methods and animation is enabled the callback is stored
    // temporarily to this array. The callbacks are called with the first
    // argument as false if the animation succeeded without interruptions and
    // with the first argument as true if the animation was interrupted.
    inst._visibilityQueue = [];

    // Layout animation callback queue. Whenever a callback is provided for
    // layout method and animation is enabled the callback is stored temporarily
    // to this array. The callbacks are called with the first argument as false
    // if the animation succeeded without interruptions and with the first
    // argument as true if the animation was interrupted.
    inst._layoutQueue = [];

    // Set up initial positions.
    inst._left = 0;
    inst._top = 0;

    // Set element's initial styles.
    setStyles(inst._element, {
      left: '0',
      top: '0',
      transform: 'translateX(0px) translateY(0px)',
      display: isHidden ? 'none' : 'block'
    });

    // Calculate and set up initial dimensions.
    inst._refresh();

    // Set initial styles for the child element.
    if (isHidden) {
      container._itemHideHandler.start(inst, true);
    }
    else {
      container._itemShowHandler.start(inst, true);
    }

    // Set up drag handler.
    inst._drag = stn.dragEnabled ? new Container.Drag(inst) : null;

    // Set up migration handler data.
    inst._migrate = {
      isActive: false,
      appendTo: null,
      containerDiffX: 0,
      containerDiffY: 0,
      fromContainer: null,
      fromIndex: 0,
      toIndex: 0
    };

  }

  /**
   * Item - Public prototype methods
   * *******************************
   */

  /**
   * Get the instance container reference.
   *
   * @public
   * @memberof Item.prototype
   * @returns {Container}
   */
  Item.prototype.getContainer = function () {

    return containerInstances[this._containerId];

  };

  /**
   * Get the instance element.
   *
   * @public
   * @memberof Item.prototype
   * @returns {HTMLElement}
   */
  Item.prototype.getElement = function () {

    return this._element;

  };

  /**
   * Get instance element's cached width.
   *
   * @public
   * @memberof Item.prototype
   * @returns {Number}
   */
  Item.prototype.getWidth = function () {

    return this._width;

  };

  /**
   * Get instance element's cached height.
   *
   * @public
   * @memberof Item.prototype
   * @returns {Number}
   */
  Item.prototype.getHeight = function () {

    return this._height;

  };

  /**
   * Get instance element's cached margins.
   *
   * @public
   * @memberof Item.prototype
   * @returns {Object}
   *   - The returned object contains left, right, top and bottom properties
   *     which indicate the item element's cached margins.
   */
  Item.prototype.getMargin = function () {

    return {
      left: this._margin.left,
      right: this._margin.right,
      top: this._margin.top,
      bottom: this._margin.bottom
    };

  };

  /**
   * Get instance element's cached position.
   *
   * @public
   * @memberof Item.prototype
   * @returns {Object}
   *   - The returned object contains left and top properties which indicate the
   *     item element's cached position in the grid.
   */
  Item.prototype.getPosition = function () {

    return {
      left: this._left,
      top: this._top
    };

  };

  /**
   * Is the item active?
   *
   * @public
   * @memberof Item.prototype
   * @returns {Boolean}
   */
  Item.prototype.isActive = function () {

    return this._isActive;

  };

  /**
   * Is the item visible?
   *
   * @public
   * @memberof Item.prototype
   * @returns {Boolean}
   */
  Item.prototype.isVisible = function () {

    return !this._isHidden;

  };

  /**
   * Is the item being animated to visible?
   *
   * @public
   * @memberof Item.prototype
   * @returns {Boolean}
   */
  Item.prototype.isShowing = function () {

    return this._isShowing;

  };

  /**
   * Is the item being animated to hidden?
   *
   * @public
   * @memberof Item.prototype
   * @returns {Boolean}
   */
  Item.prototype.isHiding = function () {

    return this._isHiding;

  };

  /**
   * Is the item positioning?
   *
   * @public
   * @memberof Item.prototype
   * @returns {Boolean}
   */
  Item.prototype.isPositioning = function () {

    return this._isPositioning;

  };

  /**
   * Is the item being dragged?
   *
   * @public
   * @memberof Item.prototype
   * @returns {Boolean}
   */
  Item.prototype.isDragging = function () {

    return this._drag && this._drag._dragData.isActive;

  };

  /**
   * Is the item being released?
   *
   * @public
   * @memberof Item.prototype
   * @returns {Boolean}
   */
  Item.prototype.isReleasing = function () {

    return this._drag && this._drag._releaseData.isActive;

  };

  /**
   * Is the item being migrated?
   *
   * @public
   * @memberof Item.prototype
   * @returns {Boolean}
   */
  Item.prototype.isMigrating = function () {

    return this._migrate.isActive;

  };

  /**
   * Item - Protected prototype methods
   * **********************************
   */

  /**
   * Stop item's position animation if it is currently animating.
   *
   * @protected
   * @memberof Item.prototype
   * @param {Boolean} [processLayoutQueue=false]
   * @returns {Item} returns the Item instance.
   */
  Item.prototype._stopLayout = function (processLayoutQueue) {

    var inst = this;

    if (!inst._isPositioning) {
      return inst;
    }

    // Stop animation.
    inst._animate.stop();

    // Remove positioning class.
    removeClass(inst._element, inst.getContainer()._settings.itemPositioningClass);

    // Reset state.
    inst._isPositioning = false;

    // Process callback queue.
    if (processLayoutQueue) {
      processQueue(inst._layoutQueue, true, inst);
    }

    return inst;

  };

  /**
   * Recalculate item's dimensions.
   *
   * @protected
   * @memberof Item.prototype
   * @returns {Item} returns the Item instance.
   */
  Item.prototype._refresh = function () {

    var inst = this;
    var element;
    var rect;
    var sides;
    var side;
    var margin;
    var i;

    if (inst._isHidden) {
      return inst;
    }

    element = inst._element;

    // Calculate margins (ignore negative margins).
    sides = ['left', 'right', 'top', 'bottom'];
    margin = inst._margin = inst._margin || {};
    for (i = 0; i < 4; i++) {
      side = Math.round(getStyleAsFloat(element, 'margin-' + sides[i]));
      margin[sides[i]] = side > 0 ? side : 0;
    }

    // Calculate width and height (with and without margins).
    rect = element.getBoundingClientRect();
    inst._width = Math.round(rect.width);
    inst._height = Math.round(rect.height);
    inst._outerWidth = inst._width + margin.left + margin.right;
    inst._outerHeight = inst._height + margin.top + margin.bottom;

    return inst;

  };

  /**
   * Position item based on it's current data.
   *
   * @protected
   * @memberof Item.prototype
   * @param {Boolean} instant
   * @param {Function} [callback]
   * @returns {Item} returns the Item instance.
   */
  Item.prototype._layout = function (instant, callback) {

    var inst = this;
    var element = inst._element;
    var container = inst.getContainer();
    var stn = container._settings;
    var release = inst._drag ? inst._drag._releaseData : {};
    var isJustReleased = release.isActive && release.isPositioningStarted === false;
    var animDuration = isJustReleased ? stn.dragReleaseDuration : stn.layoutDuration;
    var animEasing = isJustReleased ? stn.dragReleaseEasing : stn.layoutEasing;
    var animEnabled = instant === true || inst._noLayoutAnimation ? false : animDuration > 0;
    var isPositioning = inst._isPositioning;
    var migrate = inst._migrate;
    var offsetLeft;
    var offsetTop;
    var currentLeft;
    var currentTop;
    var finish = function () {

      // Mark the item as not positioning and remove positioning classes.
      if (inst._isPositioning) {
        inst._isPositioning = false;
        removeClass(element, stn.itemPositioningClass);
      }

      // Finish up release.
      if (release.isActive) {
        inst._drag._stopRelease();
      }

      // Finish up migration.
      if (migrate.isActive) {
        inst._stopMigrate();
      }

      // Process the callback queue.
      processQueue(inst._layoutQueue, false, inst);

    };

    // Process current layout callback queue with interrupted flag on if the
    // item is currently positioning.
    if (isPositioning) {
      processQueue(inst._layoutQueue, true, inst);
    }

    // Mark release positioning as started.
    if (isJustReleased) {
      release.isPositioningStarted = true;
    }

    // Push the callback to the callback queue.
    if (typeof callback === 'function') {
      inst._layoutQueue[inst._layoutQueue.length] = callback;
    }

    // Get item container offset. This applies only for release handling in the
    // scenario where the released element is not currently within the
    // container.
    offsetLeft = release.isActive ? release.containerDiffX : migrate.isActive ? migrate.containerDiffX : 0;
    offsetTop = release.isActive ? release.containerDiffY : migrate.isActive ? migrate.containerDiffY : 0;

    // If no animations are needed, easy peasy!
    if (!animEnabled) {

      inst._stopLayout();
      inst._noLayoutAnimation = false;

      // Set the styles only if they are not set later on. If an item is being
      // released after drag and the drag container is something else than the
      // Container's element these styles will be set after the item has been
      // moved back to the Container's element, which also means that setting
      // the styles here in that scenario is a waste of resources.
      if (!(release.isActive && element.parentNode !== container._element) || !(migrate.isActive && migrate.appendTo !== container._element)) {
        setStyles(element, {
          transform: 'translateX(' + (inst._left + offsetLeft) + 'px) translateY(' + (inst._top + offsetTop) + 'px)'
        });
      }

      finish();

    }

    // If animations are needed, let's dive in.
    else {

      // Get current (relative) left and top position. Meaning that the
      // container's offset (if applicable) is subtracted from the current
      // translate values.
      if (isPositioning && inst._isDefaultAnimate) {
        currentLeft = parseFloat(Velocity.hook(element, 'translateX')) - offsetLeft;
        currentTop = parseFloat(Velocity.hook(element, 'translateY')) - offsetTop;
      }
      else {
        currentLeft = getTranslateAsFloat(element, 'x') - offsetLeft;
        currentTop = getTranslateAsFloat(element, 'y') - offsetTop;
      }

      // If the item is already in correct position there's no need to animate
      // it.
      if (inst._left === currentLeft && inst._top === currentTop) {
        inst._stopLayout();
        finish();
        return;
      }

      // Mark as positioning and add positioning class if necessary.
      if (!isPositioning) {
        inst._isPositioning = true;
        addClass(element, stn.itemPositioningClass);
      }

      // Animate.
      inst._animate.start({
        translateX: (currentLeft + offsetLeft) + 'px',
        translateY: (currentTop + offsetTop) + 'px'
      }, {
        translateX: inst._left + offsetLeft,
        translateY: inst._top + offsetTop
      }, {
        duration: animDuration,
        easing: animEasing,
        done: finish
      });

    }

    return inst;

  };

  /**
   * Show item.
   *
   * @protected
   * @memberof Item.prototype
   * @param {Boolean} instant
   * @param {Function} [callback]
   * @returns {Item} returns the Item instance.
   */
  Item.prototype._show = function (instant, callback) {

    var inst = this;
    var element = inst._element;
    var queue = inst._visibilityQueue;
    var container = inst.getContainer();
    var stn = container._settings;
    var cb = typeof callback === 'function' ? callback : null;

    // If item is showing.
    if (inst._isShowing) {

      // If instant flag is on, interrupt the current animation and set the
      // visible styles.
      if (instant) {
        container._itemShowHandler.stop();
        processQueue(queue, true, inst);
        if (cb) {
          queue[queue.length] = cb;
        }
        container._itemShowHandler.start(inst, instant, function () {
          processQueue(queue, false, inst);
        });
      }

      // Otherwise just push the callback to the queue.
      else if (cb) {
        queue[queue.length] = cb;
      }

    }

    // Otherwise if item is visible call the callback and be done with it.
    else if (!inst._isHidden) {
      cb && cb(false, inst);
    }

    // Finally if item is hidden or hiding, show it.
    else {

      // Stop ongoing hide animation.
      if (inst._isHiding) {
        container._itemHideHandler.stop(inst);
      }

      // Update item's internal state.
      inst._isActive = inst._isShowing = true;
      inst._isHidden = inst._isHiding = false;

      // Update item classes.
      addClass(element, stn.itemVisibleClass);
      removeClass(element, stn.itemHiddenClass);

      // Set item element's display style to block.
      setStyles(element, {
        display: 'block'
      });

      // Process the visibility callback queue with the interrupted flag active.
      processQueue(queue, true, inst);

      // Push the callback to the visibility callback queue.
      if (cb) {
        queue[queue.length] = cb;
      }

      // Animate child element and process the visibility callback queue after
      // succesful animation.
      container._itemShowHandler.start(inst, instant, function () {
        processQueue(queue, false, inst);
      });

    }

    return inst;

  };

  /**
   * Hide item.
   *
   * @protected
   * @memberof Item.prototype
   * @param {Boolean} instant
   * @param {Function} [callback]
   * @returns {Item}
   */
  Item.prototype._hide = function (instant, callback) {

    var inst = this;
    var element = inst._element;
    var queue = inst._visibilityQueue;
    var container = inst.getContainer();
    var stn = container._settings;
    var cb = typeof callback === 'function' ? callback : null;

    // If item is hiding.
    if (inst._isHiding) {

      // If instant flag is on, interrupt the current animation and set the
      // hidden styles.
      if (instant) {
        container._itemHideHandler.stop();
        processQueue(queue, true, inst);
        if (cb) {
          queue[queue.length] = cb;
        }
        container._itemHideHandler.start(inst, instant, function () {
          setStyles(element, {
            display: 'none'
          });
          processQueue(queue, false, inst);
        });
      }

      // Otherwise just push the callback to the queue.
      else if (cb) {
        queue[queue.length] = cb;
      }

    }

    // Otherwise if item is hidden call the callback and be done with it.
    else if (inst._isHidden) {
      cb && cb(false, inst);
    }

    // Finally if item is visible or showing, hide it.
    else {

      // Stop ongoing show animation.
      if (inst._isShowing) {
        container._itemShowHandler.stop(inst);
      }

      // Update item's internal state.
      inst._isHidden = inst._isHiding = true;
      inst._isActive = inst._isShowing = false;

      // Update item classes.
      addClass(element, stn.itemHiddenClass);
      removeClass(element, stn.itemVisibleClass);

      // Process the visibility callback queue with the interrupted flag active.
      processQueue(queue, true, inst);

      // Push the callback to the visibility callback queue.
      if (typeof callback === 'function') {
        queue[queue.length] = callback;
      }

      // Animate child element and process the visibility callback queue after
      // succesful animation.
      container._itemHideHandler.start(inst, instant, function () {
        setStyles(element, {
          display: 'none'
        });
        processQueue(queue, false, inst);
      });

    }

    return inst;

  };

  /**
   * End the migration process of an item. This method can be used to abort an
   * ongoing migration process animation or finish the migration process.
   *
   * @protected
   * @memberof Item.prototype
   * @param {Boolean} [abort=false]
   * @returns {Item}
   */
  Item.prototype._stopMigrate = function (abort) {

    var inst = this;
    var migrate = inst._migrate;
    var element;
    var container;
    var translateX;
    var translateY;
    var fromContainer;
    var fromIndex;
    var toIndex;

    if (!migrate.isActive) {
      return inst;
    }

    element = inst._element;
    container = inst.getContainer();

    // If the element is outside the container put it back there and
    // adjust position accordingly.
    if (migrate.appendTo !== container._element) {
      translateX = abort ? getTranslateAsFloat(element, 'x') - migrate.containerDiffX : inst._left;
      translateY = abort ? getTranslateAsFloat(element, 'y') - migrate.containerDiffY : inst._top;
      container._element.appendChild(element);
      setStyles(element, {
        transform: 'translateX(' + translateX + 'px) translateY(' + translateY + 'px)'
      });
    }

    // Cache migration's container instance and target index so they can be
    // provided to the end event after the migration data is reset.
    if (!abort) {
      fromContainer = migrate.fromContainer;
      fromIndex = migrate.fromIndex;
      toIndex = migrate.toIndex;
    }

    // Reset migration data.
    migrate.isActive = false;
    migrate.appendTo = null;
    migrate.containerDiffX = 0;
    migrate.containerDiffY = 0;
    migrate.fromContainer = null;
    migrate.fromIndex = 0;
    migrate.toIndex = 0;

    // Emit receiveItemEnd event.
    if (!abort) {
      container._emitter.emit(evReceiveItemEnd, {
        item: inst,
        fromContainer: fromContainer,
        fromIndex: fromIndex,
        toIndex: toIndex
      });
    }

    return inst;

  };

  /**
   * Destroy item instance.
   *
   * @protected
   * @memberof Item.prototype
   * @param {Boolean} [removeElement=false]
   */
  Item.prototype._destroy = function (removeElement) {

    var inst = this;
    var container = inst.getContainer();
    var stn = container._settings;
    var element = inst._element;
    var index = container._items.indexOf(inst);

    // Stop animations.
    inst._stopLayout(true);
    container._itemShowHandler.stop(inst);
    container._itemHideHandler.stop(inst);

    // Stop migration.
    inst._stopMigrate(true);

    // If item is being dragged or released, stop it gracefully.
    if (inst._drag) {
      inst._drag.destroy();
    }

    // Destroy animation handlers.
    inst._animate.destroy();
    inst._animateChild.destroy();

    // Remove all inline styles.
    element.removeAttribute('style');
    inst._child.removeAttribute('style');

    // Handle visibility callback queue, fire all uncompleted callbacks with
    // interrupted flag.
    processQueue(inst._visibilityQueue, true, inst);

    // Remove classes.
    removeClass(element, stn.itemPositioningClass);
    removeClass(element, stn.itemDraggingClass);
    removeClass(element, stn.itemReleasingClass);
    removeClass(element, stn.itemClass);
    removeClass(element, stn.itemVisibleClass);
    removeClass(element, stn.itemHiddenClass);

    // Remove item from Container instance if it still exists there.
    if (index > -1) {
      container._items.splice(index, 1);
    }

    // Remove element from DOM.
    if (removeElement) {
      element.parentNode.removeChild(element);
    }

    // Remove item instance from the item instances collection.
    itemInstances[inst._id] = undefined;

    // Nullify instance properties.
    nullifyInstance(inst, Item);

  };

  /**
   * Layout
   * ******
   */

  /**
   * Creates a new Layout instance.
   *
   * @public
   * @class
   * @param {Container} container
   * @param {Item[]} [items]
   */
  function Layout(container, items) {

    var inst = this;
    var stn = container._settings.layout;
    var padding = container._padding;
    var border = container._border;

    inst.items = items ? items.concat() : container.getItems('active');
    inst.slots = {};
    inst.setWidth = false;
    inst.setHeight = false;

    // Calculate the current width and height of the container.
    inst.width = container._width - border.left - border.right - padding.left - padding.right;
    inst.height = container._height - border.top - border.bottom - padding.top - padding.bottom;

    // If the user has provided custom function as a layout method invoke it.
    // Otherwise invoke the default layout method.
    typeof stn === 'function' ? stn(inst) : layoutFirstFit(inst, isPlainObject(stn) ? stn : {});

  }

  /**
   * Layout - Default layout method
   * ******************************
   */

  /**
   * LayoutFirstFit v0.3.0-dev
   * Copyright (c) 2016 Niklas Rämö <inramo@gmail.com>
   * Released under the MIT license
   *
   * The default layout method.
   *
   * @private
   * @param {Layout} layout
   * @param {Object} settings
   * @param {Boolean} [settings.fillGaps=false]
   * @param {Boolean} [settings.horizontal=false]
   * @param {Boolean} [settings.alignRight=false]
   * @param {Boolean} [settings.alignBottom=false]
   */
  function layoutFirstFit(layout, settings) {

    var emptySlots = [];
    var fillGaps = settings.fillGaps ? true : false;
    var isHorizontal = settings.horizontal ? true : false;
    var alignRight = settings.alignRight ? true : false;
    var alignBottom = settings.alignBottom ? true : false;
    var slotIds;
    var slot;
    var item;
    var i;

    // Set horizontal/vertical mode.
    if (isHorizontal) {
      layout.setWidth = true;
      layout.width = 0;
    }
    else {
      layout.setHeight = true;
      layout.height = 0;
    }

    // No need to go further if items do not exist.
    if (!layout.items.length) {
      return;
    }

    // Find slots for items.
    for (i = 0; i < layout.items.length; i++) {
      item = layout.items[i];
      slot = layoutFirstFit.getSlot(layout, emptySlots, item._outerWidth, item._outerHeight, !isHorizontal, fillGaps);
      if (isHorizontal) {
        layout.width = Math.max(layout.width, slot.left + slot.width);
      }
      else {
        layout.height = Math.max(layout.height, slot.top + slot.height);
      }
      layout.slots[item._id] = slot;
    }

    // If the alignment is set to right or bottom, we need to adjust the
    // results.
    if (alignRight || alignBottom) {
      slotIds = Object.keys(layout.slots);
      for (i = 0; i < slotIds.length; i++) {
        slot = layout.slots[slotIds[i]];
        if (alignRight) {
          slot.left = layout.width - (slot.left + slot.width);
        }
        if (alignBottom) {
          slot.top = layout.height - (slot.top + slot.height);
        }
      }
    }

  }

  /**
   * Calculate position for the layout item. Returns the left and top position
   * of the item in pixels.
   *
   * @private
   * @memberof layoutFirstFit
   * @param {Layout} layout
   * @param {Array} slots
   * @param {Number} itemWidth
   * @param {Number} itemHeight
   * @param {Boolean} vertical
   * @param {Boolean} fillGaps
   * @returns {Object}
   */
  layoutFirstFit.getSlot = function (layout, slots, itemWidth, itemHeight, vertical, fillGaps) {

    var currentSlots = slots[0] || [];
    var newSlots = [];
    var item = {
      left: null,
      top: null,
      width: itemWidth,
      height: itemHeight
    };
    var slot;
    var potentialSlots;
    var ignoreCurrentSlots;
    var i;
    var ii;

    // Try to find a slot for the item.
    for (i = 0; i < currentSlots.length; i++) {
      slot = currentSlots[i];
      if (item.width <= slot.width && item.height <= slot.height) {
        item.left = slot.left;
        item.top = slot.top;
        break;
      }
    }

    // If no slot was found for the item.
    if (item.left === null) {

      // Position the item in to the bottom left (vertical mode) or top right
      // (horizontal mode) of the grid.
      item.left = vertical ? 0 : layout.width;
      item.top = vertical ? layout.height : 0;

      // If gaps don't needs filling do not add any current slots to the new
      // slots array.
      if (!fillGaps) {
        ignoreCurrentSlots = true;
      }

    }

    // In vertical mode, if the item's bottom overlaps the grid's bottom.
    if (vertical && (item.top + item.height) > layout.height) {

      // If item is not aligned to the left edge, create a new slot.
      if (item.left > 0) {
        newSlots[newSlots.length] = {
          left: 0,
          top: layout.height,
          width: item.left,
          height: Infinity
        };
      }

      // If item is not aligned to the right edge, create a new slot.
      if ((item.left + item.width) < layout.width) {
        newSlots[newSlots.length] = {
          left: item.left + item.width,
          top: layout.height,
          width: layout.width - item.left - item.width,
          height: Infinity
        };
      }

      // Update grid height.
      layout.height = item.top + item.height;

    }

    // In horizontal mode, if the item's right overlaps the grid's right edge.
    if (!vertical && (item.left + item.width) > layout.width) {

      // If item is not aligned to the top, create a new slot.
      if (item.top > 0) {
        newSlots[newSlots.length] = {
          left: layout.width,
          top: 0,
          width: Infinity,
          height: item.top
        };
      }

      // If item is not aligned to the bottom, create a new slot.
      if ((item.top + item.height) < layout.height) {
        newSlots[newSlots.length] = {
          left: layout.width,
          top: item.top + item.height,
          width: Infinity,
          height: layout.height - item.top - item.height
        };
      }

      // Update grid width.
      layout.width = item.left + item.width;

    }

    // Clean up the current slots making sure there are no old slots that
    // overlap with the item. If an old slot overlaps with the item, split it
    // into smaller slots if necessary.
    for (i = fillGaps ? 0 : ignoreCurrentSlots ? currentSlots.length : i; i < currentSlots.length; i++) {
      potentialSlots = layoutFirstFit.splitRect(currentSlots[i], item);
      for (ii = 0; ii < potentialSlots.length; ii++) {
        slot = potentialSlots[ii];
        if (slot.width > 0 && slot.height > 0 && ((vertical && slot.top < layout.height) || (!vertical && slot.left < layout.width))) {
          newSlots[newSlots.length] = slot;
        }
      }
    }

    // Remove redundant slots and sort the new slots.
    layoutFirstFit.purgeSlots(newSlots).sort(vertical ? layoutFirstFit.sortRectsTopLeft : layoutFirstFit.sortRectsLeftTop);

    // Update the slots data.
    slots[0] = newSlots;

    // Return the item.
    return item;

  };

  /**
   * Sort rectangles with top-left gravity. Assumes that objects with
   * properties left, top, width and height are being sorted.
   *
   * @private
   * @memberof layoutFirstFit
   * @param {Object} a
   * @param {Object} b
   * @returns {Number}
   */
  layoutFirstFit.sortRectsTopLeft = function (a, b) {

    return a.top < b.top ? -1 : (a.top > b.top ? 1 : (a.left < b.left ? -1 : (a.left > b.left ? 1 : 0)));

  };

  /**
   * Sort rectangles with left-top gravity. Assumes that objects with
   * properties left, top, width and height are being sorted.
   *
   * @private
   * @memberof layoutFirstFit
   * @param {Object} a
   * @param {Object} b
   * @returns {Number}
   */
  layoutFirstFit.sortRectsLeftTop = function (a, b) {

    return a.left < b.left ? -1 : (a.left > b.left ? 1 : (a.top < b.top ? -1 : (a.top > b.top ? 1 : 0)));

  };

  /**
   * Check if a rectabgle is fully within another rectangle. Assumes that the
   * rectangle object has the following properties: left, top, width and height.
   *
   * @private
   * @memberof layoutFirstFit
   * @param {Object} a
   * @param {Object} b
   * @returns {Boolean}
   */
  layoutFirstFit.isRectWithinRect = function (a, b) {

    return a.left >= b.left && a.top >= b.top && (a.left + a.width) <= (b.left + b.width) && (a.top + a.height) <= (b.top + b.height);

  };

  /**
   * Loops through an array of slots and removes all slots that are fully within
   * another slot in the array.
   *
   * @private
   * @memberof layoutFirstFit
   * @param {Array} slots
   */
  layoutFirstFit.purgeSlots = function (slots) {

    var i = slots.length;
    var ii;
    var slotA;
    var slotB;

    while (i--) {
      slotA = slots[i];
      ii = slots.length;
      while (ii--) {
        slotB = slots[ii];
        if (i !== ii && layoutFirstFit.isRectWithinRect(slotA, slotB)) {
          slots.splice(i, 1);
          break;
        }
      }
    }

    return slots;

  };

  /**
   * Compares a rectangle to another and splits it to smaller pieces (the parts
   * that exceed the other rectangles edges). At maximum generates four smaller
   * rectangles.
   *
   * @private
   * @memberof layoutFirstFit
   * @param {Object} a
   * @param {Object} b
   * returns {Array}
   */
  layoutFirstFit.splitRect = function (a, b) {

    var ret = [];
    var overlap = !(b.left > (a.left + a.width) || (b.left + b.width) < a.left || b.top > (a.top + a.height) || (b.top + b.height) < a.top);

    // If rect a does not overlap with rect b add rect a to the return data as
    // is.
    if (!overlap) {
      ret[0] = a;
    }

    // If rect a overlaps with rect b split rect a into smaller rectangles and
    // add them to the return data.
    else {

      // Left split.
      if (a.left < b.left) {
        ret[ret.length] = {
          left: a.left,
          top: a.top,
          width: b.left - a.left,
          height: a.height
        };
      }

      // Right split.
      if ((a.left + a.width) > (b.left + b.width)) {
        ret[ret.length] = {
          left: b.left + b.width,
          top: a.top,
          width: (a.left + a.width) - (b.left + b.width),
          height: a.height
        };
      }

      // Top split.
      if (a.top < b.top) {
        ret[ret.length] = {
          left: a.left,
          top: a.top,
          width: a.width,
          height: b.top - a.top
        };
      }

      // Bottom split.
      if ((a.top + a.height) > (b.top + b.height)) {
        ret[ret.length] = {
          left: a.left,
          top: b.top + b.height,
          width: a.width,
          height: (a.top + a.height) - (b.top + b.height)
        };
      }

    }

    return ret;

  };

  /**
   * Emitter
   * *******
   */

  /**
   * Event emitter constructor.
   *
   * This is a simplified version of jvent.js event emitter library:
   * https://github.com/pazguille/jvent/blob/0.2.0/dist/jvent.js
   *
   * @public
   * @class
   */
  function Emitter() {}

  /**
   * Emitter - Public prototype methods
   * **********************************
   */

  /**
   * Bind an event listener.
   *
   * @public
   * @memberof Emitter.prototype
   * @param {String} event
   * @param {Function} listener
   * @returns {Emitter} returns the Emitter instance.
   */
  Emitter.prototype.on = function (event, listener) {

    var events = this._events = this._events || {};
    var listeners = events[event] || [];

    listeners[listeners.length] = listener;
    events[event] = listeners;

    return this;

  };

  /**
   * Unbind all event listeners that match the provided listener function.
   *
   * @public
   * @memberof Emitter.prototype
   * @param {String} event
   * @param {Function} listener
   * @returns {Emitter} returns the Emitter instance.
   */
  Emitter.prototype.off = function (event, listener) {

    var events = this._events = this._events || {};
    var listeners = events[event] || [];
    var counter = listeners.length;

    if (counter) {
      while (counter--) {
        if (listener === listeners[i]) {
          listeners.splice(counter, 1);
        }
      }
    }

    return this;

  };

  /**
   * Emit all listeners in a specified event with the provided arguments.
   *
   * @public
   * @memberof Emitter.prototype
   * @param {String} event
   * @param {*} [arg1]
   * @param {*} [arg2]
   * @param {*} [arg3]
   * @returns {Emitter} returns the Emitter instance.
   */
  Emitter.prototype.emit = function (event, arg1, arg2, arg3) {

    var events = this._events = this._events || {};
    var listeners = events[event] || [];
    var listenersLength = listeners.length;
    var argsLength;
    var i;

    if (listenersLength) {
      argsLength = arguments.length - 1;
      listeners = listeners.concat();
      for (i = 0; i < listenersLength; i++) {
        argsLength === 0 ? listeners[i]() :
        argsLength === 1 ? listeners[i](arg1) :
        argsLength === 2 ? listeners[i](arg1, arg2) :
                           listeners[i](arg1, arg2, arg3);
      }
    }

    return this;

  };

  /**
   * Destroy emitter instance. Basically just removes all bound listeners.
   *
   * @public
   * @memberof Emitter.prototype
   * @returns {Emitter} returns the Emitter instance.
   */
  Emitter.prototype.destroy = function () {

    var events = this._events || {};
    var eventNames = Object.keys(events);
    var i;

    for (i = 0; i < eventNames.length; i++) {
      events[eventNames[i]].length = 0;
      events[eventNames[i]] = null;
    }

    return this;

  };

  /**
   * Animate
   * *******
   */

  /**
   * Muuri's internal animation engine. Uses Velocity.
   *
   * @public
   * @class
   * @param {Item} item
   * @param {HTMLElement} element
   */
  function Animate(item, element) {

    this._element = element;
    this._queue = libName + '-' + (++uuid);
    this._isAnimating = false;

  }

  /**
   * Animate - Public prototype methods
   * **********************************
   */

  /**
   * Start instance's animation. Automatically stops current animation if it is
   * running.
   *
   * @public
   * @memberof Animate.prototype
   * @param {?Object} propsCurrent
   * @param {Object} propsTarget
   * @param {Object} [options]
   * @param {Number} [options.duration=300]
   * @param {Number} [options.delay=0]
   * @param {String} [options.easing='ease']
   */
  Animate.prototype.start = function (propsCurrent, propsTarget, options) {

    var inst = this;
    var element = inst._element;
    var opts = options || {};
    var callback = typeof opts.done === 'function' ? opts.done : null;
    var velocityOpts = {
      duration: opts.duration || 300,
      delay: opts.delay || 0,
      easing: opts.easing || 'ease',
      queue: inst._queue
    };

    // Stop current animation, if running.
    if (inst._isAnimating) {
      inst.stop();
    }

    // Otherwise if current props exist force feed current values to Velocity.
    if (propsCurrent) {
      hookStyles(element, propsCurrent);
    }

    // Set as animating.
    inst._isAnimating = true;

    // Add callback if it exists.
    if (callback) {
      velocityOpts.complete = function () {
        callback();
      };
    }

    // Set up and start the animation.
    Velocity(element, propsTarget, velocityOpts);
    Velocity.Utilities.dequeue(element, inst._queue);

  };

  /**
   * Stop instance's current animation if running.
   *
   * @public
   * @memberof Animate.prototype
   */
  Animate.prototype.stop = function () {

    if (this._isAnimating) {
      this._isAnimating = false;
      Velocity(this._element, 'stop', this._queue);
    }

  };

  /**
   * Destroy the instance and stop current animation if it is running.
   *
   * @public
   * @memberof Animate.prototype
   * @returns {Boolean}
   */
  Animate.prototype.destroy = function () {

    this.stop();
    nullifyInstance(this, Animate);

  };

  /**
   * Drag
   * ****
   */

  /**
   * Bind Hammer touch interaction to an item.
   *
   * @class
   * @private
   * @param {Item} item
   */
  function Drag(item) {

    if (!Hammer) {
      throw Error('[' + libName + '] required dependency Hammer is not defined.');
    }

    var drag = this;
    var element = item._element;
    var container = item.getContainer();
    var stn = container._settings;
    var checkPredicate = typeof stn.dragStartPredicate === 'function' ? stn.dragStartPredicate : Drag.defaultStartPredicate;
    var predicate = null;
    var predicateEvent = null;
    var hammer;

    drag._itemId = item._id;
    drag._containerId = container._id;
    drag._hammer = hammer = new Hammer.Manager(element);
    drag._isMigrating = false;
    drag._dragData = {};
    drag._releaseData = {};

    // Setup item's initial drag and release data.
    drag._setupDragData();
    drag._setupReleaseData();

    // Setup overlap checker function.
    drag._checkSortOverlap = debounce(function () {
      if (drag._dragData.isActive) {
        drag._checkOverlap();
      }
    }, stn.dragSortInterval);

    // Setup sort predicate.
    drag._sortPredicate = typeof stn.dragSortPredicate === 'function' ? stn.dragSortPredicate : Drag.defaultSortPredicate;

    // Setup drag scroll handler.
    drag._scrollHandler = function (e) {
      drag._onDragScroll(e);
    };

    // Add drag recognizer to hammer.
    hammer.add(new Hammer.Pan({
      event: 'drag',
      pointers: 1,
      threshold: 0,
      direction: Hammer.DIRECTION_ALL
    }));

    // Add draginit recognizer to hammer.
    hammer.add(new Hammer.Press({
      event: 'draginit',
      pointers: 1,
      threshold: 1000,
      time: 0
    }));

    // This is not ideal, but saves us from a LOT of hacks. Let's try to keep
    // the default drag setup consistent across devices.
    hammer.set({touchAction: 'none'});

    // Bind drag events.
    hammer
    .on('draginit dragstart dragmove', function (e) {

      // Always update the predicate event.
      predicateEvent = e;

      // Create predicate if it does not exist yet.
      if (!predicate) {
        predicate = new Predicate(function () {
          if (predicate === this) {
            drag._onDragStart(predicateEvent);
          }
        });
      }

      // If predicate is resolved and dragging is active, do the move.
      if (predicate._isResolved && drag._dragData.isActive) {
        drag._onDragMove(e);
      }

      // Otherwise, check the predicate.
      else if (!predicate._isRejected && !predicate._isResolved) {
        checkPredicate.call(drag._getContainer(), drag._getItem(), e, predicate);
      }

    })
    .on('dragend dragcancel draginitup', function (e) {

      // Do final predicate check to allow unbinding stuff for the current drag
      // procedure within the predicate callback.
      predicate.reject();
      checkPredicate.call(drag._getContainer(), drag._getItem(), e, predicate);

      // If predicate is resolved and dragging is active, do the end.
      if (predicate._isResolved && drag._dragData.isActive) {
        drag._onDragEnd(e);
      }

      // Nullify predicate reference.
      predicate = null;
      predicateEvent = null;

    });

    // Prevent native link/image dragging for the item and ite's child element.
    // Consider providing a public interface for this so the user can call this
    // method for all descendant elements.
    disableNativeDrag(element);
    disableNativeDrag(item._child);

  }

  /**
   * Drag - Public methods
   * *********************
   */

  /**
   * Default drag start predicate handler.
   *
   * @public
   * @memberof Drag
   * @param {Item} item
   * @param {Object} event
   * @param {Predicate} predicate
   */
  Drag.defaultStartPredicate = function (item, event, predicate) {

    predicate.resolve();

  };

  /**
   * Default drag sort predicate.
   *
   * @public
   * @memberof Drag
   * @param {Item} item
   * @returns {Boolean|Object}
   *   - Returns false if no valid index was found. Otherwise returns an object
   *     that has three properties as specified below.
   *   - @param {String} action - "move" or "swap".
   *   - @param {Number} index - the new index.
   *   - @param {?Container} [container=null] - the new container.
   */
  Drag.defaultSortPredicate = function (item) {

    var drag = item._drag;
    var rootContainer = drag._getContainer();
    var config = rootContainer._settings.dragSortPredicate || {};
    var containers = rootContainer._getSortConnections(true);
    var itemRect = {
      width: item._width,
      height: item._height,
      left: Math.round(drag._dragData.elementClientX),
      top: Math.round(drag._dragData.elementClientY)
    };
    var containerOffsetLeft = 0;
    var containerOffsetTop = 0;
    var matchScore = null;
    var matchIndex;
    var overlapScore;
    var toContainer;
    var toContainerItems;
    var toContainerItem;
    var container;
    var padding;
    var border;
    var i;

    // First step is checking out which container the dragged item overlaps
    // the most currently.
    for (i = 0; i < containers.length; i++) {

      // Check how much dragged element overlaps the container.
      container = containers[i];
      padding = container._padding;
      border = container._border;
      overlapScore = getOverlapScore(itemRect, {
        width: container._width - border.left - border.right - padding.left - padding.right,
        height: container._height - border.top - border.bottom - padding.top - padding.bottom,
        left: container._offset.left + border.left + padding.left,
        top: container._offset.top + border.top + border.left
      });

      // Update best match if the overlap score is higher than the current
      // match.
      if (matchScore === null || overlapScore > matchScore) {
        matchScore = overlapScore;
        matchIndex = i;
      }

    }

    // If we found no container that overlaps the dragged item, return false
    // immediately to indicate that no sorting should occur.
    if (!matchScore) {
      return false;
    }

    // Get the sort container and its's items.
    toContainer = containers[matchIndex];
    toContainerItems = toContainer._items;

    // If item is moved within it's originating container adjust item's left and
    // top props.
    if (toContainer === rootContainer) {
      itemRect.left = Math.round(drag._dragData.gridX) + item._margin.left;
      itemRect.top = Math.round(drag._dragData.gridY) + item._margin.top;
    }

    // If item is moved to/within another container get container's offset (from
    // the container's content edge).
    else {
      containerOffsetLeft = toContainer._offset.left + toContainer._border.left + toContainer._padding.left;
      containerOffsetTop = toContainer._offset.top + toContainer._border.top + toContainer._padding.top;
    }

    // Reset the best match variables.
    matchIndex = matchScore = null;

    // If the target container has items.
    if (toContainerItems.length) {

      // Loop through the items and try to find a match.
      for (i = 0; i < toContainerItems.length; i++) {

        toContainerItem = toContainerItems[i];

        // If the item is active and is not the target item.
        if (toContainerItem._isActive && toContainerItem !== item) {

          // Get overlap data.
          overlapScore = getOverlapScore(itemRect, {
            width: toContainerItem._width,
            height: toContainerItem._height,
            left: Math.round(toContainerItem._left) + toContainerItem._margin.left + containerOffsetLeft,
            top: Math.round(toContainerItem._top) + toContainerItem._margin.top + containerOffsetTop
          });

          // Update best match if the overlap score is higher than the current
          // best match.
          if (matchScore === null || overlapScore > matchScore) {
            matchScore = overlapScore;
            matchIndex = i;
          }

        }

      }

    }

    // Otherwise if the target container is empty compare the dragged item
    // against the container itself.
    else {
      matchIndex = 0;
      padding = toContainer._padding;
      border = toContainer._border;
      matchScore = getOverlapScore(itemRect, {
        width: toContainer._width - border.left - border.right - padding.left - padding.right,
        height: toContainer._height - border.top - border.bottom - padding.top - padding.bottom,
        left: toContainer._offset.left + border.left + padding.left,
        top: toContainer._offset.top + border.top + border.left
      });
    }

    // Check if the best match overlaps enough to justify a placement switch.
    if (matchScore !== null && matchScore >= (config.threshold || 50)) {
      return {
        container: toContainer,
        index: matchIndex,
        action: config.action || 'move'
      };
    }

    return false;

  };

  /**
   * Drag - Public prototype methods
   * *******************************
   */

  /**
   * Destroy instance.
   *
   * @public
   * @memberof Drag.prototype
   * @returns {Drag}
   */
  Drag.prototype.destroy = function () {

    var drag = this;
    var item = drag._getItem();

    if (drag._dragData.isActive) {
      drag._stopDrag();
    }
    else if (drag._releaseData.isActive) {
      drag._stopRelease(true);
    }

    drag._hammer.destroy();
    enableNativeDrag(item._element);
    enableNativeDrag(item._child);
    nullifyInstance(drag, Drag);

    return drag;

  };

  /**
   * Drag - Protected prototype methods
   * **********************************
   */

  /**
   * Get Item instance.
   *
   * @protected
   * @memberof Drag.prototype
   * @returns {?Item}
   */
  Drag.prototype._getItem = function () {

    return itemInstances[this._itemId] || null;

  };

  /**
   * Get Container instance.
   *
   * @protected
   * @memberof Drag.prototype
   * @returns {?Item}
   */
  Drag.prototype._getContainer = function () {

    return containerInstances[this._containerId] || null;

  };

  /**
   * Setup/reset drag data.
   *
   * @protected
   * @memberof Drag.prototype
   * @returns {Drag}
   */
  Drag.prototype._setupDragData = function () {

    var drag = this;
    var dragData = drag._dragData;

    // Is item being dragged?
    dragData.isActive = false;

    // Hammer event data.
    dragData.startEvent = null;
    dragData.currentEvent = null;

    // Scroll parents of the dragged element and container.
    dragData.scrollParents = [];

    // The current translateX/translateY position.
    dragData.left = 0;
    dragData.top = 0;

    // Dragged element's current position within the grid.
    dragData.gridX = 0;
    dragData.gridY = 0;

    // Dragged element's current offset from window's northwest corner. Does
    // not account for element's margins.
    dragData.elementClientX = 0;
    dragData.elementClientY = 0;

    // Offset difference between the dragged element's temporary drag
    // container and it's original container.
    dragData.containerDiffX = 0;
    dragData.containerDiffY = 0;

    return drag;

  };

  /**
   * Setup/reset release data.
   *
   * @protected
   * @memberof Drag.prototype
   * @returns {Drag}
   */
  Drag.prototype._setupReleaseData = function () {

    var drag = this;
    var release = drag._releaseData;

    release.isActive = false;
    release.isPositioningStarted = false;
    release.containerDiffX = 0;
    release.containerDiffY = 0;

    return drag;

  };

  /**
   * Check (during drag) if an item is overlapping other items and based on
   * the configuration do a relayout.
   *
   * @protected
   * @memberof Drag.prototype
   * @returns {Drag}
   */
  Drag.prototype._checkOverlap = function () {

    var drag = this;
    var item = drag._getItem();
    var result = drag._sortPredicate(item);
    var dragEvent;
    var currentContainer;
    var currentIndex;
    var targetContainer;
    var targetIndex;
    var sortAction;

    if (!result) {
      return drag;
    }

    dragEvent = drag._dragData.currentEvent;
    currentContainer = item.getContainer();
    currentIndex = currentContainer._items.indexOf(item);
    targetContainer = result.container || currentContainer;
    targetIndex = result.index;
    sortAction = result.action || 'move';

    // If the item was moved within it's current container.
    if (currentContainer === targetContainer) {

      // Do the sort.
      (sortAction === 'swap' ? arraySwap : arrayMove)(currentContainer._items, currentIndex, targetIndex);

      // Emit dragSort event.
      currentContainer._emitter.emit(evDragSort, dragEvent, {
        item: item,
        fromIndex: currentIndex,
        toIndex: targetIndex,
        action: sortAction
      });

      // Layout the container.
      currentContainer.layoutItems();

    }

    // If the item was moved to another container.
    else {

      // Update item's container id reference.
      item._containerId = targetContainer._id;

      // Update drag instances's migrating indicator.
      drag._isMigrating = item._containerId !== drag._containerId;

      // Move item instance from current container to target container.
      currentContainer._items.splice(currentIndex, 1);
      insertItemsToArray(targetContainer._items, item, targetIndex);

      // Emit dragSend event.
      currentContainer._emitter.emit(evDragSend, dragEvent, {
        item: item,
        fromIndex: currentIndex,
        toContainer: targetContainer,
        toIndex: targetIndex
      });

      // Emit dragReceive event.
      targetContainer._emitter.emit(evDragReceive, dragEvent, {
        item: item,
        fromContainer: currentContainer,
        fromIndex: currentIndex,
        toIndex: targetIndex
      });

      // Layout both containers.
      currentContainer.layoutItems();
      targetContainer.layoutItems();

    }

    return drag;

  };

  /**
   * If item is dragged to another container, finish the migration process
   * gracefully.
   *
   * @protected
   * @memberof Drag.prototype
   * @returns {Drag}
   */
  Drag.prototype._finishMigration = function () {

    var drag = this;
    var item = drag._getItem();
    var element = item._element;
    var origContainer = drag._getContainer();
    var origContainerStn = origContainer._settings;
    var targetContainer = item.getContainer();
    var targetContainerStn = targetContainer._settings;
    var appendTo = targetContainerStn.dragEnabled && targetContainerStn._dragContainer ? targetContainerStn._dragContainer : targetContainer._element;
    var releaseDiffX = 0;
    var releaseDiffY = 0;
    var release;
    var offsetDiff;
    var translateX;
    var translateY;

    // Reset migrating indicator to avoid infinite loops.
    drag._isMigrating = false;

    // If drag is not currently active set the release as active (to fool the
    // drag.destroy() method) so that drag.stopRelease() gets called.
    if (!drag._dragData.isActive) {
      drag._releaseData.isActive = true;
    }

    // Destroy current drag.
    drag.destroy();

    // Destroy current animation handlers.
    item._animate.destroy();
    item._animateChild.destroy();

    // Remove current classnames.
    removeClass(element, origContainerStn.itemClass);
    removeClass(element, origContainerStn.itemVisibleClass);
    removeClass(element, origContainerStn.itemHiddenClass);

    // Add new classnames.
    addClass(element, targetContainerStn.itemClass);
    addClass(element, targetContainerStn.itemVisibleClass);

    // Instantiate new animation controllers.
    item._animate = new Container.AnimateLayout(item, element);
    item._animateChild = new Container.AnimateVisibility(item, item._child);
    item._isDefaultAnimate = item._animate instanceof Animate;
    item._isDefaultChildAnimate = item._animateChild instanceof Animate;

    // Get current translate values.
    translateX = getTranslateAsFloat(element, 'x');
    translateY = getTranslateAsFloat(element, 'y');

    // Move the item inside the new container.
    appendTo.appendChild(element);

    // Calculate how much offset difference the new container has with the
    // old container and adjust the translate value accordingly.
    offsetDiff = getContainerOffsetDiff(element, origContainer._element);
    translateX += offsetDiff.left;
    translateY += offsetDiff.top;

    // In the likely case that the layout container is not the target container
    // we need to calculate how much offset difference there is between the
    // containers and store it as offset difference to the release data.
    if (appendTo !== targetContainer._element) {
      offsetDiff = getContainerOffsetDiff(element, targetContainer._element);
      releaseDiffX = offsetDiff.left;
      releaseDiffY = offsetDiff.top;
    }

    // Update translate styles.
    setStyles(element, {
      transform: 'translateX(' + translateX + 'px) translateY(' + translateY + 'px)'
    });

    // Update child element's styles to reflect the current visibility state.
    item._child.removeAttribute('style');
    targetContainer._itemShowHandler.start(item, true);

    // Refresh item's dimensions, because they might have changed with the
    // addition of the new classnames.
    item._refresh();

    // Recreate item's drag handler.
    item._drag = targetContainerStn.dragEnabled ? new Container.Drag(item) : null;

    // Emit dragReceiveDrop event.
    targetContainer._emitter.emit(evDragReceiveDrop, item);

    // If the item has drag handling, start the release.
    if (item._drag) {
      release = item._drag._releaseData;
      release.containerDiffX = releaseDiffX;
      release.containerDiffY = releaseDiffY;
      item._drag._startRelease();
    }

    // Otherwise just do a layout.
    else {
      item._layout();
    }

    return drag;

  };

  /**
   * Abort dragging and reset drag data.
   *
   * @protected
   * @memberof Drag.prototype
   * @returns {Drag}
   */
  Drag.prototype._stopDrag = function () {

    var drag = this;
    var dragData = drag._dragData;
    var element;
    var container;
    var i;

    if (!dragData.isActive) {
      return drag;
    }

    // If the item is being dropped into another container, finish it up and
    // return immediately.
    if (drag._isMigrating) {
      drag._finishMigration();
      return;
    }

    element = drag._getItem()._element;
    container = drag._getContainer();

    // Remove scroll listeners.
    for (i = 0; i < dragData.scrollParents.length; i++) {
      dragData.scrollParents[i].removeEventListener('scroll', drag._scrollHandler);
    }

    // Cancel overlap check.
    drag._checkSortOverlap('cancel');

    // Append item element to the container if it's not it's child. Also make
    // sure the translate values are adjusted to account for the DOM shift.
    if (element.parentNode !== container._element) {
      container._element.appendChild(element);
      setStyles(element, {
        transform: 'translateX(' + dragData.gridX + 'px) translateY(' + dragData.gridY + 'px)'
      });
    }

    // Remove dragging class.
    removeClass(element, container._settings.itemDraggingClass);

    // Reset drag data.
    drag._setupDragData();

    return drag;

  };

  /**
   * Start the release process of an item.
   *
   * @protected
   * @memberof Drag.prototype
   * @returns {Drag}
   */
  Drag.prototype._startRelease = function () {

    var drag = this;
    var releaseData = drag._releaseData;
    var item;
    var element;
    var container;

    if (releaseData.isActive) {
      return drag;
    }

    item = drag._getItem();
    element = item._element;
    container = drag._getContainer();

    // Flag release as active.
    releaseData.isActive = true;

    // Add release classname to released element.
    addClass(element, container._settings.itemReleasingClass);

    // Emit dragReleaseStart event.
    container._emitter.emit(evDragReleaseStart, item);

    // Position the released item.
    item._layout(false);

    return drag;

  };

  /**
   * End the release process of an item. This method can be used to abort an
   * ongoing release process (animation) or finish the release process.
   *
   * @protected
   * @memberof Drag.prototype
   * @param {Boolean} [abort=false]
   *  - Should the release be aborted? When true, the release end event won't be
   *    emitted. Set to true only when you need to abort the release process
   *    while the item is animating to it's position.
   * @returns {Drag}
   */
  Drag.prototype._stopRelease = function (abort) {

    var drag = this;
    var releaseData = drag._releaseData;
    var item;
    var element;
    var container;
    var translateX;
    var translateY;

    if (!releaseData.isActive) {
      return drag;
    }

    item = drag._getItem();
    element = item._element;
    container = drag._getContainer();

    // Remove release classname from the released element.
    removeClass(element, container._settings.itemReleasingClass);

    // If the released element is outside the container put it back there
    // and adjust position accordingly.
    if (element.parentNode !== container._element) {
      translateX = abort ? getTranslateAsFloat(element, 'x') - releaseData.containerDiffX : item._left;
      translateY = abort ? getTranslateAsFloat(element, 'y') - releaseData.containerDiffY : item._top;
      container._element.appendChild(element);
      setStyles(element, {
        transform: 'translateX(' + translateX + 'px) translateY(' + translateY + 'px)'
      });
    }

    // Reset release data.
    drag._setupReleaseData();

    // Emit dragReleaseEnd event.
    if (!abort) {
      container._emitter.emit(evDragReleaseEnd, item);
    }

    return drag;

  };

  /**
   * Drag start handler.
   *
   * @protected
   * @memberof Drag.prototype
   * @returns {Drag}
   */
  Drag.prototype._onDragStart = function (e) {

    var drag = this;
    var item = drag._getItem();
    var element;
    var container;
    var stn;
    var dragData;
    var releaseData;
    var currentLeft;
    var currentTop;
    var containerElement;
    var dragContainer;
    var offsetDiff;
    var elementGBCR;
    var i;

    // If item is not active, don't start the drag.
    if (!item._isActive) {
      return;
    }

    element = item._element;
    container = drag._getContainer();
    stn = container._settings;
    dragData = drag._dragData;
    releaseData = drag._releaseData;

    // Stop current positioning animation.
    if (item._isPositioning) {
      item._stopLayout(true);
    }

    // Stop current migration animation.
    if (item._migrate.isActive) {
      item._stopMigrate(true);
    }

    // If item is being released reset release data, remove release class and
    // import the element styles from release data to drag data.
    if (releaseData.isActive) {
      removeClass(element, stn.itemReleasingClass);
      drag._setupReleaseData();
    }

    // Setup drag data.
    dragData.isActive = true;
    dragData.startEvent = dragData.currentEvent = e;

    // Get element's current position.
    currentLeft = getTranslateAsFloat(element, 'x');
    currentTop = getTranslateAsFloat(element, 'y');

    // Get container references.
    containerElement = container._element;
    dragContainer = stn.dragContainer;

    // Set initial left/top drag value.
    dragData.left = dragData.gridX = currentLeft;
    dragData.top = dragData.gridY = currentTop;

    // If a specific drag container is set and it is different from the
    // container element we need to cast some extra spells.
    if (dragContainer && dragContainer !== containerElement) {

      // If dragged element is already in drag container.
      if (element.parentNode === dragContainer) {

        // Get offset diff.
        offsetDiff = getContainerOffsetDiff(element, containerElement);
        // Store the container offset diffs to drag data.
        dragData.containerDiffX = offsetDiff.left;
        dragData.containerDiffY = offsetDiff.top;
        // Set up relative drag position data.
        dragData.gridX = currentLeft - dragData.containerDiffX;
        dragData.gridY = currentTop - dragData.containerDiffY;

      }

      // If dragged element is not within the correct container.
      else {

        // Append element into correct container.
        dragContainer.appendChild(element);

        // Get offset diff.
        offsetDiff = getContainerOffsetDiff(element, containerElement);

        // Store the container offset diffs to drag data.
        dragData.containerDiffX = offsetDiff.left;
        dragData.containerDiffY = offsetDiff.top;

        // Set up drag position data.
        dragData.left = currentLeft + dragData.containerDiffX;
        dragData.top = currentTop + dragData.containerDiffY;

        // Fix position to account for the append procedure.
        setStyles(element, {
          transform: 'translateX(' + dragData.left + 'px) translateY(' + dragData.top + 'px)'
        });

      }

    }

    // Get and store element's current offset from window's northwest corner.
    elementGBCR = element.getBoundingClientRect();
    dragData.elementClientX = elementGBCR.left;
    dragData.elementClientY = elementGBCR.top;

    // Get drag scroll parents.
    dragData.scrollParents = getScrollParents(element);
    if (dragContainer && dragContainer !== containerElement) {
      dragData.scrollParents = arrayUnique(dragData.scrollParents.concat(getScrollParents(containerElement)));
    }

    // Bind scroll listeners.
    for (i = 0; i < dragData.scrollParents.length; i++) {
      dragData.scrollParents[i].addEventListener('scroll', drag._scrollHandler);
    }

    // Set drag class.
    addClass(element, stn.itemDraggingClass);

    // Emit dragStart event.
    container._emitter.emit(evDragStart, e, item);

    return drag;

  };

  /**
   * Drag move handler.
   *
   * @protected
   * @memberof Drag.prototype
   * @returns {Drag}
   */
  Drag.prototype._onDragMove = function (e) {

    var drag = this;
    var item = drag._getItem();
    var element;
    var container;
    var stn;
    var dragData;
    var xDiff;
    var yDiff;

    // If item is not active, reset drag.
    if (!item._isActive) {
      drag._stopDrag();
      return;
    }

    element = item._element;
    container = drag._getContainer();
    stn = container._settings;
    dragData = drag._dragData;

    // Get delta difference from last dragmove event.
    xDiff = e.deltaX - dragData.currentEvent.deltaX;
    yDiff = e.deltaY - dragData.currentEvent.deltaY;

    // Update current event.
    dragData.currentEvent = e;

    // Update position data.
    dragData.left += xDiff;
    dragData.top += yDiff;
    dragData.gridX += xDiff;
    dragData.gridY += yDiff;
    dragData.elementClientX += xDiff;
    dragData.elementClientY += yDiff;

    // Update element's translateX/Y values.
    setStyles(element, {
      transform: 'translateX(' + dragData.left + 'px) translateY(' + dragData.top + 'px)'
    });

    // Overlap handling.
    if (stn.dragSort) {
      drag._checkSortOverlap();
    }

    // Emit dragMove event.
    container._emitter.emit(evDragMove, e, item);

    return drag;

  };

  /**
   * Drag scroll handler.
   *
   * @protected
   * @memberof Drag.prototype
   * @returns {Drag}
   */
  Drag.prototype._onDragScroll = function (e) {

    console.log(e);

    var drag = this;
    var item = drag._getItem();
    var element = item._element;
    var container = drag._getContainer();
    var stn = container._settings;
    var dragData = drag._dragData;
    var containerElement = container._element;
    var dragContainer = stn.dragContainer;
    var elementGBCR = element.getBoundingClientRect();
    var xDiff = dragData.elementClientX - elementGBCR.left;
    var yDiff = dragData.elementClientY - elementGBCR.top;
    var offsetDiff;

    // Update container diff.
    if (dragContainer && dragContainer !== containerElement) {
      offsetDiff = getContainerOffsetDiff(element, containerElement);
      dragData.containerDiffX = offsetDiff.left;
      dragData.containerDiffY = offsetDiff.top;
    }

    // Update position data.
    dragData.left += xDiff;
    dragData.top += yDiff;
    dragData.gridX = dragData.left - dragData.containerDiffX;
    dragData.gridY = dragData.top - dragData.containerDiffY;

    // Update element's translateX/Y values.
    setStyles(element, {
      transform: 'translateX(' + dragData.left + 'px) translateY(' + dragData.top + 'px)'
    });

    // Overlap handling.
    if (stn.dragSort) {
      drag._checkSortOverlap();
    }

    // Emit dragScroll event.
    container._emitter.emit(evDragScroll, e, item);

    return drag;

  };

  /**
   * Drag end handler.
   *
   * @protected
   * @memberof Drag.prototype
   * @returns {Drag}
   */
  Drag.prototype._onDragEnd = function (e) {

    var drag = this;
    var item = drag._getItem();
    var element = item._element;
    var container = drag._getContainer();
    var stn = container._settings;
    var dragData = drag._dragData;
    var releaseData = drag._releaseData;
    var i;

    // If item is not active, reset drag.
    if (!item._isActive) {
      drag._stopDrag();
      return;
    }

    // Finish currently queued overlap check.
    if (stn.dragSort) {
      drag._checkSortOverlap('finish');
    }

    // Remove scroll listeners.
    for (i = 0; i < dragData.scrollParents.length; i++) {
      dragData.scrollParents[i].removeEventListener('scroll', drag._scrollHandler);
    }

    // Remove drag classname from element.
    removeClass(element, stn.itemDraggingClass);

    // Setup release data.
    releaseData.containerDiffX = dragData.containerDiffX;
    releaseData.containerDiffY = dragData.containerDiffY;

    // Reset drag data.
    drag._setupDragData();

    // Emit dragEnd event.
    container._emitter.emit(evDragEnd, e, item);

    // Finish up the migration process if needed.
    if (drag._isMigrating) {
      drag._finishMigration();
    }

    // Otherwise start the release process.
    else {
      drag._startRelease();
    }

    return drag;

  };

  /**
   * Predicate
   * *********
   */

  /**
   * Generic predicate constructor.
   *
   * @private
   * @class
   * @param {Function} [onResolved]
   * @param {Function} [onRejected]
   */
  function Predicate(onResolved, onRejected) {

    this._isResolved = false;
    this._isRejected = false;
    this._onResolved = onResolved;
    this._onRejected = onRejected;

  }

  /**
   * Predicate - Public prototype methods
   * ************************************
   */

  /**
   * Check if predicate is resolved.
   *
   * @public
   * @memberof Predicate.prototype
   * returns {Boolean}
   */
  Predicate.prototype.isResolved = function () {

    return this._isResolved;

  };

  /**
   * Check if predicate is rejected.
   *
   * @public
   * @memberof Predicate.prototype
   * returns {Boolean}
   */
  Predicate.prototype.isRejected = function () {

    return this._isRejected;

  };

  /**
   * Resolve predicate.
   *
   * @public
   * @memberof Predicate.prototype
   */
  Predicate.prototype.resolve = function () {

    var inst = this;
    if (!inst._isRejected && !inst._isResolved) {
      inst._isResolved = true;
      if (typeof inst._onResolved === 'function') {
        inst._onResolved();
      }
      inst._onResolved = inst._onRejected = null;
    }

  };

  /**
   * Reject predicate.
   *
   * @public
   * @memberof Predicate.prototype
   */
  Predicate.prototype.reject = function () {

    var inst = this;
    if (!inst._isRejected && !inst._isResolved) {
      inst._isRejected = true;
      if (typeof inst._onRejected === 'function') {
        inst._onRejected();
      }
      inst._onResolved = inst._onRejected = null;
    }

  };

  /**
   * Helpers - Generic
   * *****************
   */

  /**
   * Normalize array index. Basically this function makes sure that the provided
   * array index is within the bounds of the provided array and also transforms
   * negative index to the matching positive index.
   *
   * @private
   * @param {Array} array
   * @param {Number} index
   */
  function normalizeArrayIndex(array, index) {

    var length = array.length;
    var maxIndex = length - 1;

    if (index > maxIndex) {
      return maxIndex;
    }
    else if (index < 0) {
      return Math.max(length + index, 0);
    }

    return index;

  }

  /**
   * Swap array items.
   *
   * @private
   * @param {Array} array
   * @param {Number} index
   *   - Index (positive or negative) of the item that will be swapped.
   * @param {Number} withIndex
   *   - Index (positive or negative) of the other item that will be swapped.
   */
  function arraySwap(array, index, withIndex) {

    // Make sure the array has two or more items.
    if (array.length < 2) {
      return;
    }

    // Normalize the indices.
    var indexA = normalizeArrayIndex(array, index);
    var indexB = normalizeArrayIndex(array, withIndex);
    var temp;

    // Swap the items.
    if (indexA !== indexB) {
      temp = array[indexA];
      array[indexA] = array[indexB];
      array[indexB] = temp;
    }

  }

  /**
   * Move array item to another index.
   *
   * @private
   * @param {Array} array
   * @param {Number} fromIndex
   *   - Index (positive or negative) of the item that will be moved.
   * @param {Number} toIndex
   *   - Index (positive or negative) where the item should be moved to.
   */
  function arrayMove(array, fromIndex, toIndex) {

    // Make sure the array has two or more items.
    if (array.length < 2) {
      return;
    }

    // Normalize the indices.
    var from = normalizeArrayIndex(array, fromIndex);
    var to = normalizeArrayIndex(array, toIndex);

    // Add target item to the new position.
    if (from !== to) {
      array.splice(to, 0, array.splice(from, 1)[0]);
    }

  }

  /**
   * Returns a new duplicate free version of the provided array.
   *
   * @private
   * @param {Array} array
   * @returns {Array}
   */
  function arrayUnique(array) {

    var ret = [];
    var len = array.length;
    var i;

    if (len) {
      ret[0] = array[0];
      for (i = 1; i < len; i++) {
        if (ret.indexOf(array[i]) < 0) {
          ret[ret.length] = array[i];
        }
      }
    }

    return ret;

  }

  /**
   * Check if a value is a plain object.
   *
   * @private
   * @param {*} val
   * @returns {Boolean}
   */
  function isPlainObject(val) {

    return typeof val === 'object' && Object.prototype.toString.call(val) === '[object Object]';

  }

  /**
   * Check if a value is a node list
   *
   * @private
   * @param {*} val
   * @returns {Boolean}
   */
  function isNodeList(val) {

    var type = Object.prototype.toString.call(val);
    return type === '[object HTMLCollection]' || type === '[object NodeList]';

  }

  /**
   * Merge two objects recursively (deep merge). The source object's properties
   * are merged to the target object.
   *
   * @private
   * @param {Object} target
   *   - The target object.
   * @param {Object} source
   *   - The source object.
   * @returns {Object} Returns the target object.
   */
  function mergeObjects(target, source) {

    // Loop through the surce object's props.
    Object.keys(source).forEach(function (propName) {

      var isObject = isPlainObject(source[propName]);

      // If target and source values are both objects, merge the objects and
      // assign the merged value to the target property.
      if (isPlainObject(target[propName]) && isObject) {
        target[propName] = mergeObjects({}, target[propName]);
        target[propName] = mergeObjects(target[propName], source[propName]);
      }

      // Otherwise set the source object's value to target object and make sure
      // that object and array values are cloned and directly assigned.
      else {
        target[propName] = isObject ? mergeObjects({}, source[propName]) :
          Array.isArray(source[propName]) ? source[propName].concat() :
          source[propName];
      }

    });

    return target;

  }

  /**
   * Sanitizes styles definition object within settings. Basically just removes
   * all properties that have a value of null or undefined.
   *
   * @private
   * @param {Object} styles
   * @returns {Object} Returns a new object.
   */
  function sanitizeStyleSettings(styles) {

    var ret = {};

    Object.keys(styles).forEach(function (prop) {
      var val = styles[prop];
      if (val !== undefined && val !== null) {
        ret[prop] = val;
      }
    });

    return ret;

  }

  /**
   * Merge default settings with user settings. The returned object is a new
   * object with merged values. The merging is a deep merge meaning that all
   * objects and arrays within the provided settings objects will be also merged
   * so that modifying the values of the settings object will have no effect on
   * the returned object.
   *
   * @private
   * @param {Object} defaultSettings
   * @param {Object} [userSettings]
   * @returns {Object} Returns a new object.
   */
  function mergeSettings(defaultSettings, userSettings) {

    // Create a fresh copy of default settings.
    var ret = mergeObjects({}, defaultSettings);

    // Merge user settings to default settings.
    ret = userSettings ? mergeObjects(ret, userSettings) : ret;

    // Sanitize show styles (if they exist).
    if (ret.show && ret.show.styles) {
      ret.show.styles = sanitizeStyleSettings(ret.show.styles);
    }

    // Sanitize hide styles (if they exist).
    if (ret.hide && ret.hide.styles) {
      ret.hide.styles = sanitizeStyleSettings(ret.hide.styles);
    }

    return ret;

  }

  /**
   * Insert an item or an array of items to array to a specified index. Mutates
   * the array. The index can be negative in which case the items will be added
   * to the end of the array.
   *
   * @private
   * @param {Array} array
   * @param {*} items
   * @param {Number} [index=-1]
   */
  function insertItemsToArray(array, items, index) {

    var targetIndex = typeof index === 'number' ? index : -1;
    array.splice.apply(array, [targetIndex < 0 ? array.length - targetIndex + 1 : targetIndex, 0].concat(items));

  }

  /**
   * Returns a function, that, as long as it continues to be invoked, will not
   * be triggered. The function will be called after it stops being called for
   * N milliseconds. The returned function accepts one argument which, when
   * being "finish", calls the debounced function immediately if it is currently
   * waiting to be called, and when being "cancel" cancels the currently queued
   * function call.
   *
   * @private
   * @param {Function} fn
   * @param {Number} wait
   * @returns {Function}
   */
  function debounce(fn, wait) {

    var timeout;
    var actionCancel = 'cancel';
    var actionFinish = 'finish';

    return wait > 0 ? function (action) {

      if (timeout !== undefined) {
        timeout = global.clearTimeout(timeout);
        if (action === actionFinish) {
          fn();
        }
      }

      if (action !== actionCancel && action !== actionFinish) {
        timeout = global.setTimeout(function () {
          timeout = undefined;
          fn();
        }, wait);
      }

    } : function (action) {

      if (action !== actionCancel) {
        fn();
      }

    };

  }

  /**
   * Helpers - DOM utils
   * *******************
   */

  /**
   * Returns the computed value of an element's style property as a string.
   *
   * @private
   * @param {HTMLElement} element
   * @param {String} style
   * @returns {String}
   */
  function getStyle(element, style) {

    return global.getComputedStyle(element, null).getPropertyValue(style === 'transform' ? transform.styleName || style : style);

  }

  /**
   * Returns the computed value of an element's style property transformed into
   * a float value.
   *
   * @private
   * @param {HTMLElement} el
   * @param {String} style
   * @returns {Number}
   */
  function getStyleAsFloat(el, style) {

    return parseFloat(getStyle(el, style)) || 0;

  }

  /**
   * Returns the element's computed translateX/Y value as a float. Assumes that
   * the translate value is defined as pixels.
   *
   * @private
   * @param {HTMLElement} element
   * @param {String} axis
   *   - "x" or "y".
   * @returns {Number}
   */
  function getTranslateAsFloat(element, axis) {

    return parseFloat((getStyle(element, 'transform') || '').replace('matrix(', '').split(',')[axis === 'x' ? 4 : 5]) || 0;

  }

  /**
   * Set inline styles to an element.
   *
   * @private
   * @param {HTMLElement} element
   * @param {Object} styles
   */
  function setStyles(element, styles) {

    var props = Object.keys(styles);
    var prop;
    var val;
    var i;

    for (i = 0; i < props.length; i++) {
      prop = props[i];
      val = styles[prop];
      element.style[prop === 'transform' && transform ? transform.propName : prop] = val;
    }

  }

  /**
   * Set inline styles to an element using Velocity's hook method.
   *
   * @private
   * @param {HTMLElement} element
   * @param {Object} styles
   */
  function hookStyles(element, styles) {

    var props = Object.keys(styles);
    var i;

    for (i = 0; i < props.length; i++) {
      Velocity.hook(element, props[i], styles[props[i]]);
    }

  }

  /**
   * Add class to an element.
   *
   * @private
   * @param {HTMLElement} element
   * @param {String} className
   */
  function addClass(element, className) {

    if (element.classList) {
      element.classList.add(className);
    }
    else if (!elementMatches(element, '.' + className)) {
      element.className += ' ' + className;
    }

  }

  /**
   * Remove class name from an element.
   *
   * @private
   * @param {HTMLElement} element
   * @param {String} className
   */
  function removeClass(element, className) {

    if (element.classList) {
      element.classList.remove(className);
    }
    else if (elementMatches(element, '.' + className)) {
      element.className = (' ' + element.className + ' ').replace(' ' + className + ' ', ' ').trim();
    }

  }

  /**
   * Checks the supported element.matches() method and returns a function that
   * can be used to call the supported method.
   *
   * @private
   * @returns {Function}
   */
  function getSupportedElementMatches() {

    var p = Element.prototype;
    var fn = p.matches || p.matchesSelector || p.webkitMatchesSelector || p.mozMatchesSelector || p.msMatchesSelector || p.oMatchesSelector;
    return function (el, selector) {
      return fn.call(el, selector);
    };

  }

  /**
   * Returns the supported style property's prefix, property name and style name
   * or null if the style property is not supported. This is used for getting
   * the supported transform.
   *
   * @private
   * @param {String} style
   * @returns {?Object}
   */
  function getSupportedStyle(style) {

    var docElem = document.documentElement;
    var styleCap = style.charAt(0).toUpperCase() + style.slice(1);
    var prefixes = ['', 'Webkit', 'Moz', 'O', 'ms'];
    var prefix;
    var propName;
    var i;

    for (i = 0; i < prefixes.length; i++) {
      prefix = prefixes[i];
      propName = prefix ? prefix + styleCap : style;
      if (docElem.style[propName] !== undefined) {
        prefix = prefix.toLowerCase();
        return {
          prefix: prefix,
          propName: propName,
          styleName: prefix ? '-' + prefix + '-' + style : style
        };
      }
    }

    return null;

  }

  /**
   * Calculate the offset difference between an element's containing block
   * element and another element.
   *
   * @private
   * @param {HTMLElement} element
   * @param {HTMLElement} anchor
   * @returns {PlaceData}
   */
  function getContainerOffsetDiff(element, anchor) {

    var container = getContainingBlock(element) || document;
    var ret = {
      left: 0,
      top: 0
    };
    var containerOffset;
    var anchorOffset;

    if (container === anchor) {
      return ret;
    }

    containerOffset = getOffsetFromDocument(container, 'padding');
    anchorOffset = getOffsetFromDocument(anchor, 'padding');

    return {
      left: anchorOffset.left - containerOffset.left,
      top: anchorOffset.top - containerOffset.top
    };

  }

  /**
   * Helpers - Borrowed/forked from other libraries
   * **********************************************
   */

  /**
   * Get element's scroll parents.
   *
   * Borrowed from jQuery UI library (and heavily modified):
   * https://github.com/jquery/jquery-ui/blob/63448148a217da7e64c04b21a04982f0d64aabaa/ui/scroll-parent.js
   *
   * @private
   * @param {HTMLElement} element
   * @returns {Array}
   */
  function getScrollParents(element) {

    var ret = [];
    var overflowRegex = /(auto|scroll)/;
    var parent = element.parentNode;

    // If transformed elements leak fixed elements.
    if (transformLeaksFixed) {

      // If the element is fixed it can not have any scroll parents.
      if (getStyle(element, 'position') === 'fixed') {
        return ret;
      }

      // Find scroll parents.
      while (parent && parent !== document && parent !== document.documentElement) {
        if (overflowRegex.test(getStyle(parent, 'overflow') + getStyle(parent, 'overflow-y') + getStyle(parent, 'overflow-x'))) {
          ret[ret.length] = parent;
        }
        parent = getStyle(parent, 'position') === 'fixed' ? null : parent.parentNode;
      }

      // If parent is not fixed element, add window object as the last scroll
      // parent.
      if (parent !== null) {
        ret[ret.length] = global;
      }

    }
    // If fixed elements behave as defined in the W3C specification.
    else {

      // Find scroll parents.
      while (parent && parent !== document) {

        // If the currently looped element is fixed ignore all parents that are
        // not transformed.
        if (getStyle(element, 'position') === 'fixed' && !isTransformed(parent)) {
          parent = parent.parentNode;
          continue;
        }

        // Add the parent element to return items if it is scrollable.
        if (overflowRegex.test(getStyle(parent, 'overflow') + getStyle(parent, 'overflow-y') + getStyle(parent, 'overflow-x'))) {
          ret[ret.length] = parent;
        }

        // Update element and parent references.
        element = parent;
        parent = parent.parentNode;

      }

      // If the last item is the root element, replace it with the global
      // object (window). The root element scroll is propagated to the window.
      if (ret[ret.length - 1] === document.documentElement) {
        ret[ret.length - 1] = global;
      }

      // Otherwise add global object (window) as the last scroll parent.
      else {
        ret[ret.length] = global;
      }

    }

    return ret;

  }

  /**
   * Detects if transformed elements leak fixed elements. According W3C
   * transform rendering spec a transformed element should contain even fixed
   * elements. Meaning that fixed elements are positioned relative to the
   * closest transformed ancestor element instead of window. However, not every
   * browser follows the spec (IE and older Firefox). So we need to test it.
   * https://www.w3.org/TR/css3-2d-transforms/#transform-rendering
   *
   * Borrowed from Mezr (v0.6.1):
   * https://github.com/niklasramo/mezr/blob/0.6.1/mezr.js#L607
   *
   * @private
   * @returns {Boolean}
   *   - Returns true if transformed elements leak fixed elements, false
   *     otherwise.
   */
  function doesTransformLeakFixed() {

    if (!transform) {
      return true;
    }

    var outer = document.createElement('div');
    var inner = document.createElement('div');
    var leftNotTransformed;
    var leftTransformed;

    setStyles(outer, {
      display: 'block',
      visibility: 'hidden',
      position: 'absolute',
      width: '1px',
      height: '1px',
      left: '1px',
      top: '0',
      margin: '0',
      transform: 'none'
    });

    setStyles(inner, {
      display: 'block',
      position: 'fixed',
      width: '1px',
      height: '1px',
      left: '0',
      top: '0',
      margin: '0',
      transform: 'none'
    });

    outer.appendChild(inner);
    document.body.appendChild(outer);
    leftNotTransformed = inner.getBoundingClientRect().left;
    outer.style[transform.propName] = 'scaleX(1)';
    leftTransformed = inner.getBoundingClientRect().left;
    document.body.removeChild(outer);

    return leftTransformed === leftNotTransformed;

  }

  /**
   * Returns true if element is transformed, false if not. In practice the element's display value
   * must be anything else than "none" or "inline" as well as have a valid transform value applied
   * in order to be counted as a transformed element.
   *
   * Borrowed from Mezr (v0.6.1):
   * https://github.com/niklasramo/mezr/blob/0.6.1/mezr.js#L661
   *
   * @private
   * @param {HTMLElement} element
   * @returns {Boolean}
   */
  function isTransformed(element) {

    var transform = getStyle(element, 'transform');
    var display = getStyle(element, 'display');

    return transform !== 'none' && display !== 'inline' && display !== 'none';

  }

  /**
   * Returns the element's containing block.
   *
   * Borrowed from Mezr (v0.6.1):
   * https://github.com/niklasramo/mezr/blob/0.6.1/mezr.js#L274
   *
   * @private
   * @param {Document|HTMLElement|Window} element
   * @returns {?Document|HTMLElement|Window}
   */
  function getContainingBlock(element) {

    var position;
    var ret;

    // If we have document return null right away.
    if (element === document) {
      return null;
    }

    // If we have window return document right away.
    if (element === global) {
      return document;
    }

    // Now that we know we have an element in our hands, let's get it's position. Get element's
    // current position value if a specific position is not provided.
    position = getStyle(element, 'position');

    // Relative element's container is always the element itself.
    if (position === 'relative') {
      return element;
    }

    // If element is not positioned (static or an invalid position value), always return null.
    if (position !== 'fixed' && position !== 'absolute') {
      return null;
    }

    // If the element is fixed and transforms leak fixed elements, always return window.
    if (position === 'fixed' && transformLeaksFixed) {
      return global;
    }

    // Alrighty, so now fetch the element's parent (which is document for the root) and set it as
    // the initial containing block. Fallback to null if everything else fails.
    ret = element === document.documentElement ? document : element.parentElement || null;

    // If element is fixed positioned.
    if (position === 'fixed') {

      // As long as the containing block is an element and is not transformed, try to get the
      // element's parent element and fallback to document.
      while (ret && ret !== document && !isTransformed(ret)) {
        ret = ret.parentElement || document;
      }

      return ret === document ? global : ret;

    }

    // If the element is absolute positioned. As long as the containing block is an element, is
    // static and is not transformed, try to get the element's parent element and fallback to
    // document.
    while (ret && ret !== document && getStyle(ret, 'position') === 'static' && !isTransformed(ret)) {
      ret = ret.parentElement || document;
    }

    return ret;

  }

  /**
   * Returns the element's (or window's) document offset, which in practice
   * means the vertical and horizontal distance between the element's northwest
   * corner and the document's northwest corner.
   *
   * Borrowed from Mezr (v0.6.1):
   * https://github.com/niklasramo/mezr/blob/0.6.1/mezr.js#L1006
   *
   * @private
   * @param {Document|HTMLElement|Window} element
   * @param {Edge} [edge='border']
   * @returns {Object}
   */
  function getOffsetFromDocument(element, edge) {

    var ret = {
      left: 0,
      top: 0
    };

    // Document's offsets are always 0.
    if (element === document) {
      return ret;
    }

    // Add viewport's scroll left/top to the respective offsets.
    ret.left = global.pageXOffset || 0;
    ret.top = global.pageYOffset || 0;

    // Window's offsets are the viewport's scroll left/top values.
    if (element.self === global.self) {
      return ret;
    }

    // Now we know we are calculating an element's offsets so let's first get the element's
    // bounding client rect. If it is not cached, then just fetch it.
    var gbcr = element.getBoundingClientRect();

    // Add bounding client rect's left/top values to the offsets.
    ret.left += gbcr.left;
    ret.top += gbcr.top;

    // Sanitize edge.
    edge = edge || 'border';

    // Exclude element's positive margin size from the offset if needed.
    if (edge === 'margin') {
      var marginLeft = getStyleAsFloat(element, 'margin-left');
      var marginTop = getStyleAsFloat(element, 'margin-top');
      ret.left -= marginLeft > 0 ? marginLeft : 0;
      ret.top -= marginTop > 0 ? marginTop : 0;
    }

    // Include element's border size to the offset if needed.
    else if (edge !== 'border') {
      ret.left += getStyleAsFloat(element, 'border-left-width');
      ret.top += getStyleAsFloat(element, 'border-top-width');
    }

    // Include element's padding size to the offset if needed.
    if (edge === 'content') {
      ret.left += getStyleAsFloat(element, 'padding-left');
      ret.top += getStyleAsFloat(element, 'padding-top');
    }

    return ret;

  }

  /**
   * Browsers allow dragging links and images by creating a "ghost image", which
   * interferes with Muuri's drag flow. This function prevents that from
   * happening.
   *
   * @private
   * @param {HTMLElement} element
   */
  function disableNativeDrag(element) {

    var tagName = element.tagName.toLowerCase();
    if (tagName === 'a' || tagName === 'img') {
      element.addEventListener('dragstart', preventDefault, false);
    }

  }

  /**
   * Removes native image/link drag prevention hacks from an element.
   *
   * @private
   * @param {HTMLElement} element
   */
  function enableNativeDrag(element) {

    var tagName = element.tagName.toLowerCase();
    if (tagName === 'a' || tagName === 'img') {
      element.removeEventListener('dragstart', preventDefault, false);
    }

  }

  /**
   * Helpers - Muuri
   * ***************
   */

  /**
   * Show or hide Container instance's items.
   *
   * @private
   * @param {Container} inst
   * @param {String} method - "show" or "hide".
   * @param {Array|HTMLElement|Item|Number} items
   * @param {Boolean} [instant=false]
   * @param {Function} [callback]
   */
  function setVisibility(inst, method, items, instant, callback) {

    var targetItems = inst.getItems(items);
    var cb = typeof instant === 'function' ? instant : callback;
    var counter = targetItems.length;
    var isShow = method === 'show';
    var startEvent = isShow ? evShowItemsStart : evHideItemsStart;
    var endEvent = isShow ? evShowItemsEnd : evHideItemsEnd;
    var isInstant = instant === true;
    var needsRelayout = false;
    var validItems = [];
    var completedItems = [];
    var hiddenItems = [];
    var item;
    var i;

    // Get valid items -> filter out items which will not be affected by this
    // method at their current state.
    for (i = 0; i < targetItems.length; i++) {
      item = targetItems[i];
      // Omg... this is a monster. No liner like one-liner.
      if (isShow ? (item._isHidden || item._isHiding || (item._isShowing && isInstant)) : (!item.isHidden || item._isShowing || (item._isHiding && isInstant))) {
        validItems[validItems.length] = item;
      }
    }

    // Set up counter based on valid items.
    counter = validItems.length;

    // If there are no items call the callback, but don't emit any events.
    if (!counter) {
      if (typeof cb === 'function') {
        cb(validItems);
      }
    }

    // Otherwise if we have some items let's dig in.
    else {

      // Emit showItemsStart/hideItemsStart event.
      inst._emitter.emit(startEvent, validItems.concat());

      // Show/hide items.
      for (i = 0; i < validItems.length; i++) {

        item = validItems[i];

        // Check if relayout or refresh is needed.
        if ((isShow && !item._isActive) || (!isShow && item._isActive)) {
          needsRelayout = true;
          if (isShow) {
            item._noLayoutAnimation = true;
            hiddenItems[hiddenItems.length] = item;
          }
        }

        // Show/hide the item.
        item['_' + method](isInstant, function (interrupted, item) {

          // If the current item's animation was not interrupted add it to the
          // completedItems array.
          if (!interrupted) {
            completedItems[completedItems.length] = item;
          }

          // If all items have finished their animations call the callback
          // and emit showItemsEnd/hideItemsEnd event.
          if (--counter < 1) {
            if (typeof cb === 'function') {
              cb(completedItems.concat());
            }
            inst._emitter.emit(endEvent, completedItems.concat());
          }

        });

      }

      // Relayout only if needed.
      if (needsRelayout) {
        if (hiddenItems.length) {
          inst.refreshItems(hiddenItems);
        }
        inst.layoutItems();
      }

    }

  }

  /**
   * Returns an object which contains start and stop methods for item's
   * show/hide process.
   *
   * @param {String} type
   * @param {?Object} [opts]
   * @param {Number} [opts.duration]
   * @param {String} [opts.easing]
   * @returns {Object}
   */
  function getItemVisbilityHandler(type, opts) {

    var duration = parseInt(opts && opts.duration) || 0;
    var isEnabled = duration > 0;
    var easing = (opts && opts.easing) || 'ease';
    var styles = opts && isPlainObject(opts.styles) ? opts.styles : null;

    return {
      start: function (item, instant, animDone) {

        var animateOpts;

        if (!isEnabled || !styles) {
          if (animDone) {
            animDone();
          }
        }
        else if (instant) {

          if (item._isDefaultChildAnimate) {
            hookStyles(item._child, styles);
          }
          else {
            setStyles(item._child, styles);
          }

          if (animDone) {
            animDone();
          }

        }
        else {

          animateOpts = {
            duration: duration,
            easing: easing,
            done: animDone
          };

          if (item._isDefaultChildAnimate) {
            item._animateChild.start(null, styles, animateOpts);
          }
          else {
            item._animateChild.start(styles, animateOpts);
          }

        }

      },
      stop: function (item) {
        item._animateChild.stop();
      }
    };

  }

  /**
   * Process item's callback queue.
   *
   * @private
   * @param {Array} queue
   * @param {Boolean} interrupted
   * @param {Item} instance
   */
  function processQueue(queue, interrupted, instance) {

    var callbacks = queue.splice(0, queue.length);
    var i;

    for (i = 0; i < callbacks.length; i++) {
      callbacks[i](interrupted, instance);
    }

  }

  /**
   * Calculate how many percent the intersection area of two items is from the
   * maximum potential intersection area between the items.
   *
   * @private
   * @param {Object} a
   * @param {Object} b
   * @returns {Number}
   *   - A number between 0-100.
   */
  function getOverlapScore(a, b) {

    // Return 0 immediately if the rectangles do not overlap.
    if ((a.left + a.width) <= b.left || (b.left + b.width) <= a.left || (a.top + a.height) <= b.top || (b.top + b.height) <= a.top) {
      return 0;
    }

    // Calculate inersection area width and height.
    var width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
    var height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);

    // Calculate maximum intersection area width and height.
    var maxWidth = Math.min(a.width, b.width);
    var maxHeight = Math.min(a.height, b.height);

    return (width * height) / (maxWidth * maxHeight) * 100;

  }

  /**
   * Check if item is in specific state.
   *
   * @private
   * @param {Item} item
   * @param {String} state
   * Returns {Boolean}
   */
  function isItemInState(item, state) {

    return state === 'active' ? item._isActive :
      state === 'inactive' ? !item._isActive :
      state === 'visible' ? !item._isHiding :
      state === 'hidden' ? item._isHiding :
      state === 'showing' ? item._isShowing :
      state === 'hiding' ? item._isHiding :
      state === 'positioning' ? item._isPositioning :
      state === 'dragging' ? item._drag && item._drag._dragData.isActive :
      state === 'releasing' ? item._drag && item._drag._releaseData.isActive :
      state === 'migrating' ? item._migrate.isActive :
      false;

  }

  /**
   * Prevent default.
   *
   * @private
   * @param {Object} e
   */
  function preventDefault(e) {

    if (e.preventDefault) {
      e.preventDefault();
    }

  }

  /**
   * Nullify an instance's own and prototype properties.
   *
   * @private
   * @param {Object} instance
   * @param {Object} Constructor
   */
  function nullifyInstance(instance, Constructor) {

    var props = Object.keys(instance).concat(Object.keys(Constructor.prototype));
    var i;

    for (i = 0; i < props.length; i++) {
      instance[props[i]] = null;
    }

  }

  /**
   * Init
   */

  return Container;

}));
