//////////////////////////////////////////////////////////////////////////////////////////
//        ___            _     ___                                                      //
//        |   |   \/    | ) |  |           This software may be modified and distri-    //
//    O-  |-  |   |  -  |   |  |-  -O      buted under the terms of the MIT license.    //
//        |   |_  |     |   |  |_          See the LICENSE file for details.            //
//                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////

'use strict';

const Gio = imports.gi.Gio;

//////////////////////////////////////////////////////////////////////////////////////////
// This creates a default menu configuration which is used when the user has no menus   //
// configured.                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////

var DefaultMenu = class DefaultMenu {

  // -------------------------------------------------------------------- public interface

  // Most parts of the menu are hard-coded. Some applications however are chosen based on
  // the user's defaults.
  static get() {

    const menu = {
      name: 'Example Menu',
      icon: '🌟️',
      type: 'Menu',
      shortcut: '<Primary>space',
      id: 0,
      children: [
        {
          name: 'Sound',
          icon: 'multimedia-audio-player',
          type: 'Submenu',
          children: [
            {
              name: 'Play / Pause',
              icon: '⏯️',
              type: 'Shortcut',
              data: 'AudioPlay',
            },
            {
              name: 'Mute',
              icon: '🔈️',
              type: 'Shortcut',
              data: 'AudioMute',
            },
            {
              name: 'Next Title',
              icon: '⏩️',
              type: 'Shortcut',
              data: 'AudioNext',
              angle: 90
            },
            {
              name: 'Previous Title',
              icon: '⏪️',
              type: 'Shortcut',
              data: 'AudioPrev',
              angle: 270
            }
          ]
        },
        {
          name: 'Window Management',
          icon: 'preferences-system-windows',
          type: 'Submenu',
          children: [
            {
              name: 'Maximize Window',
              icon: 'view-fullscreen',
              type: 'Shortcut',
              data: '<Alt>F10',
            },
            {
              name: 'Open Windows',
              icon: 'preferences-system-windows',
              type: 'RunningApps',
            },
            {
              name: 'Gnome Shell',
              icon: 'workspace-switcher',
              type: 'Submenu',
              children: [
                {
                  name: 'Up',
                  icon: '🔼️',
                  type: 'Shortcut',
                  data: '<Primary><Alt>Up',
                  angle: 0
                },
                {
                  name: 'Overview',
                  icon: '💠️',
                  type: 'Shortcut',
                  data: '<Super>s',
                },
                {
                  name: 'Down',
                  icon: '🔽️',
                  type: 'Shortcut',
                  data: '<Primary><Alt>Down',
                  angle: 180
                },
                {
                  name: 'Show Apps',
                  icon: 'view-grid',
                  type: 'Shortcut',
                  data: '<Super>a',
                }
              ]
            },
            {
              name: 'Close Window',
              icon: 'window-close',
              type: 'Shortcut',
              data: '<Alt>F4',
            }
          ]
        },
        {
          name: 'Bookmarks',
          icon: 'folder',
          type: 'Bookmarks',
        },
        {
          name: 'Default Apps',
          icon: 'emblem-favorite',
          type: 'Submenu',
          children: [
            {
              name: 'Fly-Pie Settings',
              icon: 'gnome-settings',
              type: 'Command',
              data: 'gnome-extensions prefs flypie@schneegans.github.com',
            },
            {
              name: 'Internet',
              icon: 'applications-internet',
              type: 'Submenu',
              children: []
            },
            {
              name: 'Multimedia',
              icon: 'applications-multimedia',
              type: 'Submenu',
              children: []
            },
            {
              name: 'Utilities',
              icon: 'applications-accessories',
              type: 'Submenu',
              children: [
                {
                  name: 'Terminal',
                  icon: 'org.gnome.Terminal',
                  type: 'Command',
                  data: 'gnome-terminal',
                },
                {
                  name: 'Files',
                  icon: 'org.gnome.Nautilus',
                  type: 'Command',
                  data: 'nautilus --new-window %U',
                },
                {
                  name: 'GNOME System Monitor',
                  icon: 'org.gnome.SystemMonitor',
                  type: 'Command',
                  data: 'gnome-system-monitor',
                }
              ]
            }
          ]
        }
      ]
    };

    // Add some default applications. It's possible that the user has no such default
    // applications, so we have to check this for each one...
    const browser     = this._getForUri('http');
    const mailClient  = this._getForUri('mailto');
    const audioPlayer = this._getForMimeType('audio/ogg');
    const videoPlayer = this._getForMimeType('video/ogg');
    const imageViewer = this._getForMimeType('image/jpg');
    const textEditor  = this._getForMimeType('text/plain');

    if (mailClient != null) {
      menu.children[3].children[1].children.push(mailClient);
    }

    if (browser != null) {
      menu.children[3].children[1].children.push(browser);
    }

    if (audioPlayer != null) {
      menu.children[3].children[2].children.push(audioPlayer);
    }

    if (videoPlayer != null) {
      menu.children[3].children[2].children.push(videoPlayer);
    }

    if (imageViewer != null) {
      menu.children[3].children[2].children.push(imageViewer);
    }

    if (textEditor != null) {
      menu.children[3].children[3].children.push(textEditor);
    }

    return menu;
  }

  // ----------------------------------------------------------------------- private stuff

  // Returns an action configuration for an application which is default for the given
  // mime type. For example, "text/plain" will result in an action for Gedit on many
  // systems.
  static _getForMimeType(mimeType) {
    return this._getForAppInfo(Gio.AppInfo.get_default_for_type(mimeType, false));
  }

  // Returns an action configuration for an application which is default for the given uri
  // scheme. For example, "http" will result in an action for Firefox on many systems.
  static _getForUri(uri) {
    return this._getForAppInfo(Gio.AppInfo.get_default_for_uri_scheme(uri));
  }

  // Returns an action configuration for the given Gio.AppInfo. Or null, if the given
  // Gio.AppInfo is null.
  static _getForAppInfo(info) {
    if (info != null) {
      return {
        name: info.get_display_name(),
        icon: info.get_icon().to_string(),
        type: 'Command',
        data: info.get_commandline()
      };
    }
    return null;
  }
}