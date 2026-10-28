"use strict";

add_setup(async () => {
  // Disable window occlusion. See bug 1733955 / bug 1779559.
  if (navigator.platform.indexOf("Win") == 0) {
    await SpecialPowers.pushPrefEnv({
      set: [["widget.windows.window_occlusion_tracking.enabled", false]],
    });
  }
});

add_task(async () => {
  // Open a new browser window to make sure there is no navigation history.
  const newBrowser = await BrowserTestUtils.openNewBrowserWindow({});

  let event = {
    direction: SimpleGestureEvent.DIRECTION_LEFT,
  };
  ok(!newBrowser.gGestureSupport._shouldDoSwipeGesture(event));

  event = {
    direction: SimpleGestureEvent.DIRECTION_RIGHT,
  };
  ok(!newBrowser.gGestureSupport._shouldDoSwipeGesture(event));

  await BrowserTestUtils.closeWindow(newBrowser);
});

function createSimpleGestureEvent(type, direction) {
  let event = document.createEvent("SimpleGestureEvent");
  event.initSimpleGestureEvent(
    type,
    false /* canBubble */,
    false /* cancelableArg */,
    window,
    0 /* detail */,
    0 /* screenX */,
    0 /* screenY */,
    0 /* clientX */,
    0 /* clientY */,
    false /* ctrlKey */,
    false /* altKey */,
    false /* shiftKey */,
    false /* metaKey */,
    0 /* button */,
    null /* relatedTarget */,
    0 /* allowedDirections */,
    direction,
    1 /* delta */
  );
  return event;
}

add_task(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["ui.swipeAnimationEnabled", false],
      ["browser.history_swipe_animation.disabled", false],
    ],
  });

  // Open a new browser window and load two pages so that the browser can go
  // back but can't go forward.
  const newWindow = await BrowserTestUtils.openNewBrowserWindow({});

  // gHistroySwipeAnimation gets initialized in a requestIdleCallback so we need
  // to wait for the initialization.
  await TestUtils.waitForCondition(() => {
    return (
      // There's no explicit notification for the initialization, so we wait
      // until `isLTR` matches the browser locale state.
      newWindow.gHistorySwipeAnimation.isLTR != Services.locale.isAppLocaleRTL
    );
  });

  BrowserTestUtils.startLoadingURIString(
    newWindow.gBrowser.selectedBrowser,
    "about:mozilla"
  );
  await BrowserTestUtils.browserLoaded(
    newWindow.gBrowser.selectedBrowser,
    false,
    "about:mozilla"
  );
  BrowserTestUtils.startLoadingURIString(
    newWindow.gBrowser.selectedBrowser,
    "about:about"
  );
  await BrowserTestUtils.browserLoaded(
    newWindow.gBrowser.selectedBrowser,
    false,
    "about:about"
  );

  let event = createSimpleGestureEvent(
    "MozSwipeGestureMayStart",
    SimpleGestureEvent.DIRECTION_LEFT
  );
  ok(
    newWindow.gGestureSupport._shouldDoSwipeGesture(event),
    "History swipes are accepted even when swipe animations are disabled"
  );

  // Assuming we are on LTR environment.
  is(
    event.allowedDirections,
    SimpleGestureEvent.DIRECTION_LEFT,
    "Allows only swiping to left, i.e. backward"
  );

  event = createSimpleGestureEvent(
    "MozSwipeGestureMayStart",
    SimpleGestureEvent.DIRECTION_RIGHT
  );
  ok(
    newWindow.gGestureSupport._shouldDoSwipeGesture(event),
    "History swipes are accepted even when swipe animations are disabled"
  );
  is(
    event.allowedDirections,
    SimpleGestureEvent.DIRECTION_LEFT,
    "Allows only swiping to left, i.e. backward"
  );

  const animation = newWindow.gHistorySwipeAnimation;
  ok(
    animation.active,
    "Swipe indicators are active without platform animation support"
  );

  function checkIndicator(direction, boxName) {
    animation.startAnimation();
    animation.updateAnimation({
      event: createSimpleGestureEvent("MozSwipeGestureUpdate", direction),
      delta: direction === SimpleGestureEvent.DIRECTION_LEFT ? 0.3 : -0.3,
    });
    const box = animation[boxName];
    ok(!box.collapsed, "The arrow for the swipe direction is visible");
    ok(
      box.querySelector("svg").classList.contains("will-navigate"),
      "The arrow highlights when the navigation threshold is reached"
    );
    animation._removeBoxes();
  }

  checkIndicator(SimpleGestureEvent.DIRECTION_LEFT, "_prevBox");
  const browser = newWindow.gBrowser.selectedBrowser;
  let loaded = BrowserTestUtils.browserLoaded(browser, false, "about:mozilla");
  newWindow.gGestureSupport.handleEvent(
    createSimpleGestureEvent("MozSwipeGesture", SimpleGestureEvent.DIRECTION_LEFT)
  );
  await loaded;
  is(
    browser.currentURI.spec,
    "about:mozilla",
    "Swiping back loads the previous page"
  );

  event = createSimpleGestureEvent(
    "MozSwipeGestureMayStart",
    SimpleGestureEvent.DIRECTION_RIGHT
  );
  ok(
    newWindow.gGestureSupport._shouldDoSwipeGesture(event),
    "Forward swipes are accepted without animations"
  );
  ok(
    event.allowedDirections & SimpleGestureEvent.DIRECTION_RIGHT,
    "Forward navigation is available after going back"
  );
  checkIndicator(SimpleGestureEvent.DIRECTION_RIGHT, "_nextBox");
  loaded = BrowserTestUtils.browserLoaded(browser, false, "about:about");
  newWindow.gGestureSupport.handleEvent(
    createSimpleGestureEvent("MozSwipeGesture", SimpleGestureEvent.DIRECTION_RIGHT)
  );
  await loaded;
  is(
    browser.currentURI.spec,
    "about:about",
    "Swiping forward loads the next page"
  );

  await BrowserTestUtils.closeWindow(newWindow);
});

add_task(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [["ui.swipeAnimationEnabled", true]],
  });

  // Open a new browser window and load two pages so that the browser can go
  // back but can't go forward.
  const newWindow = await BrowserTestUtils.openNewBrowserWindow({});

  if (!newWindow.gHistorySwipeAnimation._isSupported()) {
    await BrowserTestUtils.closeWindow(newWindow);
    return;
  }

  function sendSwipeSequence(sendEnd) {
    let event = createSimpleGestureEvent(
      "MozSwipeGestureMayStart",
      SimpleGestureEvent.DIRECTION_LEFT
    );
    newWindow.gGestureSupport.handleEvent(event);

    event = createSimpleGestureEvent(
      "MozSwipeGestureStart",
      SimpleGestureEvent.DIRECTION_LEFT
    );
    newWindow.gGestureSupport.handleEvent(event);

    event = createSimpleGestureEvent(
      "MozSwipeGestureUpdate",
      SimpleGestureEvent.DIRECTION_LEFT
    );
    newWindow.gGestureSupport.handleEvent(event);

    event = createSimpleGestureEvent(
      "MozSwipeGestureUpdate",
      SimpleGestureEvent.DIRECTION_LEFT
    );
    newWindow.gGestureSupport.handleEvent(event);

    if (sendEnd) {
      sendSwipeEnd();
    }
  }
  function sendSwipeEnd() {
    let event = createSimpleGestureEvent(
      "MozSwipeGestureEnd",
      SimpleGestureEvent.DIRECTION_LEFT
    );
    newWindow.gGestureSupport.handleEvent(event);
  }

  // gHistroySwipeAnimation gets initialized in a requestIdleCallback so we need
  // to wait for the initialization.
  await TestUtils.waitForCondition(() => {
    return (
      // There's no explicit notification for the initialization, so we wait
      // until `isLTR` matches the browser locale state.
      newWindow.gHistorySwipeAnimation.isLTR != Services.locale.isAppLocaleRTL
    );
  });

  BrowserTestUtils.startLoadingURIString(
    newWindow.gBrowser.selectedBrowser,
    "about:mozilla"
  );
  await BrowserTestUtils.browserLoaded(
    newWindow.gBrowser.selectedBrowser,
    false,
    "about:mozilla"
  );
  BrowserTestUtils.startLoadingURIString(
    newWindow.gBrowser.selectedBrowser,
    "about:about"
  );
  await BrowserTestUtils.browserLoaded(
    newWindow.gBrowser.selectedBrowser,
    false,
    "about:about"
  );

  // Start a swipe that's not enough to navigate
  sendSwipeSequence(/* sendEnd = */ true);

  // Wait two frames
  await new Promise(r =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(r))
  );

  // The transition to fully stopped shouldn't have had enough time yet to
  // become fully stopped.
  ok(
    newWindow.gHistorySwipeAnimation._isStoppingAnimation,
    "should be stopping anim"
  );

  // Start another swipe.
  sendSwipeSequence(/* sendEnd = */ false);

  // Wait two frames
  await new Promise(r =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(r))
  );

  // We should have started a new swipe, ie we shouldn't be stopping.
  ok(
    !newWindow.gHistorySwipeAnimation._isStoppingAnimation,
    "should not be stopping anim"
  );

  sendSwipeEnd();

  await BrowserTestUtils.closeWindow(newWindow);
});
