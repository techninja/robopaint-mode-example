/**
 * @file Holds all RoboPaint example mode text renderer initialization code.
 *   @see the mode readme for all the goodies that modes come with. Also,
 *      any robopaint dependencies you add to the package JSON will be available
 *      as well, like jQuery $ and underscore _.
 */
"use strict";

var actualPen = {}; // Hold onto the latest actualPen object from updates.
var buffer = {};
var canvas = rpRequire('canvas');
var hershey = require('hersheytext');
var t = i18n.t; // The mother of all shortcuts
var textHasRendered = false; // First run boolean

mode.pageInitReady = function () {
  // Initialize the paper.js canvas with wrapper margin and other settings.
  canvas.domInit({
    replace: '#paper-placeholder', // jQuery selecter of element to replace
    paperScriptFile: 'example.ps.js', // The main PaperScript file to load
    wrapperMargin: {
      top: 30,
      left: 30,
      right: 265,
      bottom: 40
    },

    // Called when PaperScript init is complete, requires
    // canvas.paperInit(paper) to be called in this modes paperscript file.
    // Don't forget that!
    loadedCallback: paperLoadedInit
  });
}

// Callback that tells us that our Paper.js canvas is ready!
function paperLoadedInit() {
  console.log('Paper ready!');

  // Set center adjusters based on size of canvas
  $('#hcenter').attr({
    value: 0,
    min: -(robopaint.canvas.width / 2),
    max: robopaint.canvas.width / 2
  });

  $('#vcenter').attr({
    value: 0,
    min: -(robopaint.canvas.height / 2),
    max: robopaint.canvas.height / 2
  });

  $(window).resize();

  // Use mode settings management on all "managed" class items. This
  // saves/loads settings from/into the elements on change/init.
  mode.settings.$manage('.managed');

  // With Paper ready, send a single up to fill values for buffer & pen.
  mode.run('up');
}

// Catch CNCServer buffered callbacks
mode.onCallbackEvent = function(name) {
  switch (name) {
    case 'autoPaintBegin': // Should happen when we've just started
      $('#pause').prop('disabled', false); // Enable pause button
      break;
    case 'autoPaintComplete': // Should happen when we're completely done
      $('#pause').attr('class', 'ready')
        .text(robopaint.t('common.action.start'))
        .prop('disabled', false);
      $('#buttons button.normal').prop('disabled', false); // Enable options
      $('#cancel').prop('disabled', true); // Disable the cancel print button
      break;
  }
};

// Bind all controls (happens before pageInitReady, @see mode.preload.js)
mode.bindControls = function() {
  // Populate font choices
  _.each(hershey.fonts, function(font, id){
    $('<option>').text(font.name).val(id).appendTo('#fontselect');
  });

  // Bind trigger for font selection
  $('#fontselect').change(function(){
    textHasRendered = true;

    // Render some text into the SVG area with it
    paper.renderText($('#fonttext').val(), {
      layer: paper.canvas.actionLayer,
      font: $(this).val(),
      pos: {x: 0, y: 0},
      scale: parseInt($('#scale').val()) / 100,
      spaceWidth: parseInt($('#spacewidth').val()),
      charSpacing: parseFloat($('#charspacing').val() / 4),
      wrapWidth: parseInt($('#wrap').val()),
      lineHeight:parseFloat($('#lineheight').val() / 4),
      hCenter: parseInt($('#hcenter').val()),
      vCenter: parseInt($('#vcenter').val()),
      rotation: parseInt($('#rotation').val()),
      textAlign: $('#textalign input:checked').val()
    });
  }).val('futural'); // Set default font

  // Re-render on keypress/change
  $('input, textarea').on('input change', function(e){
    $('#fontselect').change();
  });

  // Bind save functionality
  $('#save').click(function() {
    robopaint.svg.save(
      robopaint.svg.wrap(paper.canvas.actionLayer.exportSVG({asString: true}))
    );
  });

  // Cancel Print
  $('#cancel').click(function(){
    var cancelPrint = confirm(t("common.action.cancelconfirm"));
    if (cancelPrint) {
      mode.onCallbackEvent('autoPaintComplete');
      mode.fullCancel(mode.t('status.cancelled'));
    }
  });

  // Bind pause click and functionality
  $('#pause').click(function() {

    // With nothing in the queue, start autopaint!
    if (buffer.length === 0) {
      $('#pause')
        .removeClass('ready')
        .attr('title', t("modes.print.status.pause"))
        .text(t('common.action.pause'))
        .prop('disabled', true);
      $('#buttons button.normal').prop('disabled', true); // Disable options
      $('#cancel').prop('disabled', false); // Enable the cancel print button

      // Auto Paint requires everything on the layer be ungrouped, so we ungroup
      // everything first, then autoPaint.
      paper.utils.ungroupAllGroups(paper.canvas.actionLayer);
      paper.utils.autoPaint(paper.canvas.actionLayer);

      // The ungrouped elements aren't terribly useful, so we can just delete them
      // then re-render them by triggering a fontselect change.
      paper.canvas.actionLayer.removeChildren();
      $('#fontselect').change();

    } else {
      // With something in the queue... we're either pausing, or resuming
      if (!buffer.paused) {
        // Starting Pause =========
        $('#pause').prop('disabled', true).attr('title', t("status.wait"));
        mode.run([
          ['status', t("status.pausing")],
          ['pause']
        ], true); // Insert at the start of the buffer so it happens immediately

        mode.onFullyPaused = function(){
          mode.run('status', t("status.paused"));
          $('#buttons button.normal').prop('disabled', false); // Enable options
          $('#pause')
            .addClass('active')
            .attr('title', t("status.resume"))
            .prop('disabled', false)
            .text(t("common.action.resume"));
        };
      } else {
        // Resuming ===============
        $('#buttons button.normal').prop('disabled', true); // Disable options
        mode.run([
          ['status', t("status.resuming")],
          ['resume']
        ], true); // Insert at the start of the buffer so it happens immediately

        mode.onFullyResumed = function(){
          $('#pause')
            .removeClass('active')
            .attr('title', t("mode.print.status.pause"))
            .text(t('common.action.pause'));
          mode.run('status', t("status.resumed"));
        };
      }
    }
  });

  // Bind to control buttons
  $('#park').click(function(){
    // If we're paused, skip the buffer
    mode.run([
      ['status', t("status.parking"), buffer.paused],
      ['park', buffer.paused], // TODO: If paused, only one message will show :/
      ['status', t("status.parked"), buffer.paused]
    ]);
  });


  $('#pen').click(function(){
    // Run height pos into the buffer, or skip buffer if paused
    var newState = 'up';
    if (actualPen.state === "up" || actualPen.state === 0) {
      newState = 'down';
    }

    mode.run(newState, buffer.paused);
  });

  // Motor unlock: Also lifts pen and zeros out.
  $('#disable').click(function(){
    mode.run([
      ['status', t("status.unlocking")],
      ['up'],
      ['zero'],
      ['unlock'],
      ['status', t("status.unlocked")]
    ]);
  });
}

// Warn the user on close about cancelling jobs.
mode.onClose = function(callback) {
  if (buffer.length) {
    var r = confirm(i18n.t('common.dialog.confirmexit'));
    if (r == true) {
      // As this is a forceful cancel, shove to the front of the queue
      mode.run(['clear', 'park', 'clearlocal'], true);
      callback(); // The user chose to close.
    }
  } else {
    callback(); // Close, as we have nothing the user is waiting on.
  }
}

// Actual pen update event
mode.onPenUpdate = function(botPen){
  paper.canvas.drawPoint.move(botPen.absCoord, botPen.lastDuration);
  actualPen = $.extend({}, botPen);

  // Update button text/state
  // TODO: change implement type <brush> based on actual implement selected!
  var key = 'common.action.brush.raise';
  if (actualPen.state === "up" || actualPen.state === 0){
    key = 'common.action.brush.lower';
  }
  $('#pen').text(t(key));
}

// An abbreviated buffer update event, contains paused/not paused & length.
mode.onBufferUpdate = function(b) {
  buffer = b;
}
