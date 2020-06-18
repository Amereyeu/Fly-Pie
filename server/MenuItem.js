//////////////////////////////////////////////////////////////////////////////////////////
//   _____       _             _____ _                                                  //
//  |   __|_ _ _|_|___ ___ ___|  _  |_|___   This software may be modified and distri-  //
//  |__   | | | | |   | . |___|   __| | -_|  buted under the terms of the MIT license.  //
//  |_____|_____|_|_|_|_  |   |__|  |_|___|  See the LICENSE file for details.          //
//                    |___|                                                             //
//////////////////////////////////////////////////////////////////////////////////////////

'use strict';

const Cairo                     = imports.cairo;
const {Clutter, GObject, Pango} = imports.gi;

const Me    = imports.misc.extensionUtils.getCurrentExtension();
const utils = Me.imports.common.utils;

//////////////////////////////////////////////////////////////////////////////////////////
// Then MenuItem is a Clutter.Actor representing one node in the menu tree hierarchy.   //
// Based on a given MenuItemState, it is drawn differently. It is composed of several   //
// sub-actors, as shown in the diagram below:                                           //
//                                                                                      //
//   .----------.   .--------------------.   The caption displays the name of the       //
//   | MenuItem |---| _caption           |   currently hovered child item.              //
//   '----------'   '--------------------'                                              //
//         |        .--------------------.   This contains up to four icon actors, one  //
//         |--------| _iconContainer     |   for each MenuItemState showing an icon.    //
//         |        '--------------------'                                              //
//         |        .--------------------.   This contains a white circle colored with  //
//         |--------| _background        |   a Clutter.ColorizeEffect.                  //
//         |        '--------------------'                                              //
//         |        .--------------------.   This contains a MenuItem for each child    //
//         '--------| _childrenContainer |   in the menu tree hierarchy.                //
//                  '--------------------'                                              //
//                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////

// This could be a static member of the class below, but this seems to be not supported
// yet.
var MenuItemState = {
  // This is the default state. It is also used for children of grandchildren - those are
  // not shown at all.
  INVISIBLE: 0,

  // This is the state of a MenuItem which is currently active but without the pointer
  // hoovering it. That means that any of its children is currently hovered.
  CENTER: 1,

  // Same as above, but without any hovered child. That means, the pointer is currently in
  // the center of the menu.
  CENTER_HOVERED: 2,

  // This is used for direct inactive children of the center element.
  CHILD: 3,

  // This is used for the currently active (hovered) direct child item of the center.
  CHILD_HOVERED: 4,

  // This is used for the children of the children of the center.
  GRANDCHILD: 5,

  // This is used for the children of the currently hovered child of the center.
  GRANDCHILD_HOVERED: 6,

  // This is used for the back-link children. In the menu hierarchy they are the parents
  // but they are drawn in a similar fashion as normal children.
  PARENT: 7,

  // Same as above, but currently hovered.
  PARENT_HOVERED: 8,
};

// clang-format off
var MenuItem = GObject.registerClass({
  Properties: {
    'angle': GObject.ParamSpec.double(
      'angle', 'angle', 'The angle of the MenuItem.',
      GObject.ParamFlags.READWRITE, 0, 2 * Math.PI, 0),
    'caption': GObject.ParamSpec.string(
      'caption', 'caption',
      'The caption to be used by this menu item. ',
      GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, ''),
    'icon': GObject.ParamSpec.string(
      'icon', 'icon',
      'The icon to be used by this menu item. ' +
      'Can be an "icon-name", an ":emoji:" or a path like "../icon.png".',
      GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, 'image-missing'),
    'background-canvas': GObject.ParamSpec.object(
      'background-canvas', 'background-canvas',
      'The Clutter.Content to be used by this menu as background.',
      GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Clutter.Content.$gtype),
  },
  Signals: {}
},
class MenuItem extends Clutter.Actor {
  // clang-format on

  _init(params = {}) {
    super._init(params);

    // The state this MenuItem currently is in. This can be changed with setState(). To
    // reflect the new state, a redraw() will be required.
    this._state = MenuItemState.INVISIBLE;

    // When the settings are modified (especially when a menu is shown in edit mode), most
    // icons are completely reloaded from disc. To make this less apparent, their current
    // size and opacity are stored in the members below.
    this._lastIconSize    = -1;
    this._lastIconOpacity = -1;

    // This will be set to false upon the first call to redraw(). It is used to initialize
    // the MenuItem's appearance without animations.
    this._firstRedraw = true;

    // This is recursively updated using setParentColor(). It is used for the background
    // coloring when the color mode is set to 'parent'.
    this._parentColor = new Clutter.Color({red: 255, green: 255, blue: 255});

    // Create background actor. This contains a simple Clutter.Canvas with a simple white
    // circle drawn onto.
    this._background                     = new Clutter.Actor();
    this._background.minification_filter = Clutter.ScalingFilter.TRILINEAR;
    this._background.add_effect(new Clutter.ColorizeEffect());
    this._background.set_content(this.background_canvas);
    this.add_child(this._background);

    // Create the Icon Container. This eventually will contain one actor for each
    // MenuItemState which has an associated icon. That means one icon for CENTER,
    // CENTER_HOVERED, CHILD, and CHILD_HOVERED. There is one icon for each state as they
    // most likely have different resolutions. We do not simply scale them because we want
    // no blurry icons.
    this._iconContainer = new Clutter.Actor();
    this.add_child(this._iconContainer);

    // Create Children Container. This eventually will contain one MenuItem for each child
    // item of this menu.
    this._childrenContainer = new Clutter.Actor();
    this.add_child(this._childrenContainer);

    // This will contain an actor for each child displaying the name of the respective
    // child. Once a child is hovered the opacity of the corresponding caption will be set
    // to 255, all others will be set to zero.
    this._caption = Clutter.Text.new();
    this._caption.set_line_wrap(true);
    this._caption.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
    this._caption.set_ellipsize(Pango.EllipsizeMode.END);
    this._caption.set_line_alignment(Pango.Alignment.CENTER);
    this._caption.set_opacity(0);
    this.add_child(this._caption);
  }

  // This is called by the Menu to add child MenuItems to this MenuItem.
  addMenuItem(menuItem) {
    this._childrenContainer.add_child(menuItem);
  }

  // This is called during redraw() of the parent MenuItem. redraw() traverses the menu
  // tree top-to-bottom, so this will be called before the redraw() of this.
  setParentColor(color) {
    this._parentColor = color;
  }

  // This is called for each item in the current menu selection chain. That is for each
  // item which is either CENTER, CENTER_HOVERED, PARENT, or PARENT_HOVERED. It will call
  // itself recursively for the entire menu tree below the active item, updating each
  // child's state accordingly. An exception are the PARENT and PARENT_HOVERED states,
  // here only the inactive children are set to GRANDCHILD and GRANDCHILD_HOVERED
  // respectively. It's not called for the active child.
  setState(state, activeChildIndex) {

    // Store the state and the active child's index as members. They will be used during
    // the next call to redraw().
    this._state = state;

    if (activeChildIndex != undefined) {
      this._activeChildIndex = activeChildIndex;
    }

    // Now call setState() recursively on all children.
    this._childrenContainer.get_children().forEach((child, index) => {
      switch (state) {

        // If the center item is hovered, no child is hovered.
        case MenuItemState.CENTER_HOVERED:
          child.setState(MenuItemState.CHILD, -1);
          break;

        // If the center item is not hovered, the child with the given index is hovered.
        case MenuItemState.CENTER:
          if (index == this._activeChildIndex) {
            child.setState(MenuItemState.CHILD_HOVERED, -1);
          } else {
            child.setState(MenuItemState.CHILD, -1);
          }
          break;

        // All children of children become grandchildren.
        case MenuItemState.CHILD:
          child.setState(MenuItemState.GRANDCHILD, -1);
          break;

        // All children of hovered children become hovered grandchildren.
        case MenuItemState.CHILD_HOVERED:
          child.setState(MenuItemState.GRANDCHILD_HOVERED, -1);
          break;

        // Children of parents are drawn like grandchildren.
        case MenuItemState.PARENT:
          if (index != this._activeChildIndex) {
            child.setState(MenuItemState.GRANDCHILD, -1);
          }
          break;

        // Children of hovered parents are drawn like hovered grandchildren.
        case MenuItemState.PARENT_HOVERED:
          if (index != this._activeChildIndex) {
            child.setState(MenuItemState.GRANDCHILD_HOVERED, -1);
          }
          break;

        // Children of invisible items are invisible as well.
        default:
          child.setState(MenuItemState.INVISIBLE, -1);
      }
    });
  }

  // This is called once after construction and then whenever something in the appearance
  // settings has changed. This calls itself recursively on the entire menu tree below
  // this MenuItem.
  onSettingsChange(settings) {

    // First we reset the icon members to force their re-creation during the next state
    // change. As many settings affect the icon size, we simply do this in any case. This
    // could be optimized by limiting this to the cases where settings keys were changed
    // which actually affect the icon size.
    this._iconContainer.destroy_all_children();
    delete this._iconContainer[MenuItemState.CENTER];
    delete this._iconContainer[MenuItemState.CENTER_HOVERED];
    delete this._iconContainer[MenuItemState.CHILD];
    delete this._iconContainer[MenuItemState.CHILD_HOVERED];

    // Then parse all settings required during the next call to redraw().
    const globalScale = settings.get_double('global-scale');

    // clang-format off
    this._settings = {
      easingDuration:          settings.get_double('easing-duration')      * 1000,
      easingMode:              settings.get_enum('easing-mode'),
      textColor:               Clutter.Color.from_string(settings.get_string('text-color'))[1],
      font:                    settings.get_string('font'),
      state: new Map ([
        [MenuItemState.INVISIBLE, {
          size:                0,
          offset:              0,
          iconSize:            0,
          iconOpacity:         0,
        }],
        [MenuItemState.CENTER, {
          colorMode:           settings.get_string('center-color-mode'),
          fixedColor:          Clutter.Color.from_string(settings.get_string('center-fixed-color'))[1],
          size:                settings.get_double('center-size')  * globalScale,
          offset:              0,
          iconSize:            settings.get_double('center-size')  * globalScale *
                               settings.get_double('center-icon-scale'),
          iconOpacity:         settings.get_double('center-icon-opacity') * 255,
          autoColorSaturation: settings.get_double('center-auto-color-saturation'),
          autoColorLuminance:  settings.get_double('center-auto-color-luminance'),
          autoColorOpacity:    settings.get_double('center-auto-color-opacity') * 255,
          drawChildrenAbove:   settings.get_boolean('child-draw-above'),
        }],
        [MenuItemState.CENTER_HOVERED, {
          colorMode:           settings.get_string('center-color-mode-hover'),
          fixedColor:          Clutter.Color.from_string(settings.get_string('center-fixed-color-hover'))[1],
          size:                settings.get_double('center-size-hover')  * globalScale,
          offset:              0,
          iconSize:            settings.get_double('center-size-hover')  * globalScale * 
                               settings.get_double('center-icon-scale-hover'),
          iconOpacity:         settings.get_double('center-icon-opacity-hover') * 255,
          autoColorSaturation: settings.get_double('center-auto-color-saturation-hover'),
          autoColorLuminance:  settings.get_double('center-auto-color-luminance-hover'),
          autoColorOpacity:    settings.get_double('center-auto-color-opacity-hover') * 255,
          drawChildrenAbove:   settings.get_boolean('child-draw-above'),
        }],
        [MenuItemState.CHILD, {
          colorMode:           settings.get_string('child-color-mode'),
          fixedColor:          Clutter.Color.from_string(settings.get_string('child-fixed-color'))[1],
          size:                settings.get_double('child-size')     * globalScale,
          offset:              settings.get_double('child-offset')   * globalScale,
          iconSize:            settings.get_double('child-size')     * globalScale * 
                               settings.get_double('child-icon-scale'),
          iconOpacity:         settings.get_double('child-icon-opacity') * 255,
          autoColorSaturation: settings.get_double('child-auto-color-saturation'),
          autoColorLuminance:  settings.get_double('child-auto-color-luminance'),
          autoColorOpacity:    settings.get_double('child-auto-color-opacity')  * 255,
          drawChildrenAbove:   settings.get_boolean('grandchild-draw-above'),
        }],
        [MenuItemState.CHILD_HOVERED, {
          colorMode:           settings.get_string('child-color-mode-hover'),
          fixedColor:          Clutter.Color.from_string(settings.get_string('child-fixed-color-hover'))[1],
          size:                settings.get_double('child-size-hover')    * globalScale,
          offset:              settings.get_double('child-offset-hover')  * globalScale,
          iconSize:            settings.get_double('child-size-hover')    * globalScale * 
                               settings.get_double('child-icon-scale-hover'),
          iconOpacity:         settings.get_double('child-icon-opacity-hover') * 255,
          autoColorSaturation: settings.get_double('child-auto-color-saturation-hover'),
          autoColorLuminance:  settings.get_double('child-auto-color-luminance-hover'),
          autoColorOpacity:    settings.get_double('child-auto-color-opacity-hover') * 255,
          drawChildrenAbove:   settings.get_boolean('grandchild-draw-above'),
        }],
        [MenuItemState.GRANDCHILD, {
          colorMode:           settings.get_string('grandchild-color-mode'),
          fixedColor:          Clutter.Color.from_string(settings.get_string('grandchild-fixed-color'))[1],
          size:                settings.get_double('grandchild-size')    * globalScale,
          offset:              settings.get_double('grandchild-offset')  * globalScale,
          iconSize:            0,
          iconOpacity:         0,
          drawAbove:           settings.get_boolean('grandchild-draw-above'),
        }],
        [MenuItemState.GRANDCHILD_HOVERED, {
          colorMode:           settings.get_string('grandchild-color-mode-hover'),
          fixedColor:          Clutter.Color.from_string(settings.get_string('grandchild-fixed-color-hover'))[1],
          size:                settings.get_double('grandchild-size-hover')   * globalScale,
          offset:              settings.get_double('grandchild-offset-hover') * globalScale,
          iconSize:            0,
          iconOpacity:         0,
          drawAbove:           settings.get_boolean('grandchild-draw-above'),
        }]
      ]),
    };
    // clang-format on

    // Most of the settings will come into effect during the call to redraw(). However,
    // some caption settings we can apply here as they won't be affected by state changes.
    const captionWidth = this._settings.state.get(MenuItemState.CENTER).size * 0.8;
    this._caption.set_size(captionWidth, captionWidth);
    this._caption.set_color(this._settings.textColor);

    // Multiply the size of the font by globalScale.
    const fontDescription = Pango.FontDescription.from_string(this._settings.font);
    const fontSize        = fontDescription.get_size();
    if (fontDescription.get_size_is_absolute()) {
      fontSize = Pango.units_from_double(fontSize);
    }
    fontDescription.set_size(fontSize * globalScale);
    this._caption.set_font_description(fontDescription);

    // Finally, call this recursively for all children.
    this._childrenContainer.get_children().forEach(
        child => child.onSettingsChange(settings));
  }

  // This updates all parameters (such as position, opacity or colors) of the individual
  // actors of this MenuItem. It is usually called after the setState() above. It
  // automatically calls redraw() on all child MenuItems of this.
  redraw() {

    // The _settings member contains a Map of settings for each MenuItemState. PARENT
    // items and PARENT_HOVERED items are drawn like CHILD and CHILD_HOVERED items
    // respectively.
    let visualState = this._state;

    switch (this._state) {
      case MenuItemState.PARENT:
        visualState = MenuItemState.CHILD;
        break;
      case MenuItemState.PARENT_HOVERED:
        visualState = MenuItemState.CHILD_HOVERED;
        break;
    }

    const settings = this._settings.state.get(visualState);

    // Depending on the corresponding settings key, raise or lower the child MenuItems
    // of this above or below the background.
    if (visualState != MenuItemState.INVISIBLE) {
      if (settings.drawChildrenAbove) {
        this.set_child_above_sibling(this._childrenContainer, this._background);
      } else {
        this.set_child_below_sibling(this._childrenContainer, this._background);
      }
    }

    // If our state is MenuItemState.CENTER, redraw the caption text. Else hide the
    // caption by setting its opacity to zero.
    if (visualState == MenuItemState.CENTER && this._activeChildIndex >= 0) {
      const child = this._childrenContainer.get_children()[this._activeChildIndex];
      this._caption.set_text(child.caption);
      this._caption.set_easing_duration(0);
      const captionHeight = this._caption.get_layout().get_pixel_extents()[1].height;
      this._caption.set_translation(
          Math.floor(-this._caption.width / 2), Math.floor(-captionHeight / 2), 0);
      this._caption.set_easing_duration(this._settings.easingDuration);

      this._caption.opacity = 255;
    } else {
      this._caption.opacity = 0;
    }

    // This easing duration and mode are used for size and position transitions further
    // below. We set the easing duration to zero for the initial call to redraw() in
    // order to avoid animations when the menu shows up.
    let easingDuration = this._firstRedraw ? 0 : this._settings.easingDuration;
    this._firstRedraw  = false;

    this.set_easing_duration(easingDuration);
    this.set_easing_mode(this._settings.easingMode);

    // If our state is some child or grandchild state, set the translation based on the
    // angle and the specified offset.
    if (visualState != MenuItemState.CENTER &&
        visualState != MenuItemState.CENTER_HOVERED &&
        this._state != MenuItemState.PARENT &&
        this._state != MenuItemState.PARENT_HOVERED) {

      this.set_translation(
          Math.floor(Math.sin(this.angle) * settings.offset),
          -Math.floor(Math.cos(this.angle) * settings.offset), 0);
    }

    // If we are in some center- or child-state and have no icon for this state yet,
    // create a new icon! This will also happen after a settings change, as icons are
    // deleted to force a re-creation here.
    if ((visualState == MenuItemState.CENTER ||
         visualState == MenuItemState.CENTER_HOVERED ||
         visualState == MenuItemState.CHILD ||
         visualState == MenuItemState.CHILD_HOVERED) &&
        this._iconContainer[visualState] == undefined) {

      // Create and save a reference to the icon.
      const icon                       = this._createIcon(this.icon, settings.iconSize);
      this._iconContainer[visualState] = icon;
      this._iconContainer.add_child(icon);

      // For the initial icon size and opacity we use _lastIconSize and _lastIconOpacity
      // if available. When the settings are modified (especially when a menu is shown
      // in edit mode), the icons are completely reloaded. To make this jitter-free,
      // _lastIconSize and _lastIconOpacity contain the corresponding values of the
      // previously deleted icon.
      this._setSizeAndOpacity(
          icon, this._lastIconSize >= 0 ? this._lastIconSize : settings.iconSize,
          this._lastIconOpacity >= 0 ? this._lastIconOpacity : settings.iconOpacity, 0,
          Clutter.AnimationMode.LINEAR);

      // If the color mode is 'auto', we calculate an average color of the icon.
      if (settings.colorMode == 'auto') {
        const tmp = new Cairo.ImageSurface(Cairo.Format.ARGB32, 24, 24);
        const ctx = new Cairo.Context(tmp);
        utils.paintIcon(ctx, this.icon, 24);

        // We store the average color as a property of the icon it belongs to.
        icon.averageColor = utils.getAverageIconColor(
            tmp, 24, settings.autoColorSaturation, settings.autoColorLuminance,
            settings.autoColorOpacity);

        // Explicitly tell Cairo to free the context memory. Is this really necessary?
        // https://wiki.gnome.org/Projects/GnomeShell/Extensions/TipsOnMemoryManagement#Cairo
        ctx.$dispose();
      }
    }

    // Set the background color depending on the background color mode.
    if (visualState == MenuItemState.INVISIBLE) {
      this._background.get_effects()[0].tint = this._parentColor;
    } else {
      if (settings.colorMode == 'auto') {
        this._background.get_effects()[0].tint =
            this._iconContainer[visualState].averageColor;
      } else if (settings.colorMode == 'parent') {
        this._background.get_effects()[0].tint = this._parentColor;
      } else {
        this._background.get_effects()[0].tint = settings.fixedColor;
      }
    }

    // Now we update the size, position and opacity of the the background actor.
    this._setSizeAndOpacity(
        this._background, settings.size, this._background.get_effects()[0].tint.alpha,
        easingDuration, this._settings.easingMode);

    // Now we update the size, position and opacity of the individual icons.
    if (visualState != MenuItemState.INVISIBLE) {
      const updateIconState = (state) => {
        if (this._iconContainer[state] != undefined) {
          this._setSizeAndOpacity(
              this._iconContainer[state], settings.iconSize,
              visualState == state ? settings.iconOpacity : 0, easingDuration,
              this._settings.easingMode);
        }
      };

      updateIconState(MenuItemState.CENTER);
      updateIconState(MenuItemState.CENTER_HOVERED);
      updateIconState(MenuItemState.CHILD);
      updateIconState(MenuItemState.CHILD_HOVERED);
    }

    // When the settings are modified (especially when a menu is shown in edit mode),
    // most icons are completely reloaded from disc. To make this less apparent, their
    // current size and opacity are stored in the members below.
    this._lastIconSize    = settings.iconSize;
    this._lastIconOpacity = settings.iconOpacity;

    // Finally call redraw() recursively on all children.
    if (visualState != MenuItemState.INVISIBLE) {
      this._childrenContainer.get_children().forEach(child => {
        child.setParentColor(this._background.get_effects()[0].tint);
        child.redraw();
      });
    }
  }

  // This creates a Clutter.Actor with an attached Clutter.Canvas containing an image of
  // this MenuItem's icon.
  _createIcon(iconName, size) {
    const canvas = new Clutter.Canvas({height: size, width: size});
    canvas.connect('draw', (c, ctx, width, height) => {
      // Clear any previous content.
      ctx.setOperator(Cairo.Operator.CLEAR);
      ctx.paint();

      // Paint the icon!
      ctx.setOperator(Cairo.Operator.OVER);
      utils.paintIcon(ctx, iconName, width);

      // Explicitly tell Cairo to free the context memory. Is this really necessary?
      // https://wiki.gnome.org/Projects/GnomeShell/Extensions/TipsOnMemoryManagement#Cairo
      ctx.$dispose();
    });

    // Trigger initial 'draw' signal emission.
    canvas.invalidate();

    // Create a new actor and set the icon canvas to be its content.
    const actor = new Clutter.Actor();
    actor.set_content(canvas);

    return actor;
  }

  // A small utility which sets the size, translation, and opacity of the given actor
  // using the given easing parameters. The opacity is always transitioned using
  // Clutter.AnimationMode.LINEAR. The translation is updated so that the actor is
  // centered.
  _setSizeAndOpacity(actor, size, opacity, easingDuration, easingMode) {

    // Set easing state.
    actor.save_easing_state();
    actor.set_easing_duration(easingDuration);
    actor.set_easing_mode(easingMode);

    // Set size and translation.
    const size2 = Math.floor(size / 2);
    actor.set_translation(-size2, -size2, 0);
    actor.set_size(size, size);

    // Set opacity using linear easing mode.
    actor.set_easing_mode(Clutter.AnimationMode.LINEAR);
    actor.set_opacity(opacity);

    // Restore previous easing state.
    actor.restore_easing_state();
  }
});