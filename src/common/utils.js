//////////////////////////////////////////////////////////////////////////////////////////
//        ___            _     ___                                                      //
//        |   |   \/    | ) |  |           This software may be modified and distri-    //
//    O-  |-  |   |  -  |   |  |-  -O      buted under the terms of the MIT license.    //
//        |   |_  |     |   |  |_          See the LICENSE file for details.            //
//                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////

'use strict';

const Cairo                                         = imports.cairo;
const {Gdk, Gtk, Gio, Pango, PangoCairo, GdkPixbuf} = imports.gi;

const Me = imports.misc.extensionUtils.getCurrentExtension();


//////////////////////////////////////////////////////////////////////////////////////////
// This method can be used to write a message to GNOME Shell's log. This is enhances    //
// the standard log() functionality by prepending the extension's name and the location //
// where the message was logged. As the extensions name is part of the location, you    //
// can more effectively watch the log output of GNOME Shell:                            //
// journalctl -f -o cat | grep -E 'flypie|'                                             //
//////////////////////////////////////////////////////////////////////////////////////////

function debug(message) {
  const stack = new Error().stack.split('\n');

  // Remove debug() function call from stack.
  stack.shift();

  // Find the index of the extension directory (e.g. flypie@schneegans.github.com) in
  // the stack entry. We do not want to print the entire absolute file path.
  const extensionRoot = stack[0].indexOf(Me.metadata.uuid);

  log('[' + stack[0].slice(extensionRoot) + '] ' + message);
}


//////////////////////////////////////////////////////////////////////////////////////////
// Creates a new Gio.Settings object for org.gnome.shell.extensions.flypie and          //
// returns it.                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////

function createSettings() {
  const schema = Gio.SettingsSchemaSource.new_from_directory(
      Me.dir.get_child('schemas').get_path(), Gio.SettingsSchemaSource.get_default(),
      false);

  return new Gio.Settings(
      {settings_schema: schema.lookup('org.gnome.shell.extensions.flypie', true)});
}


//////////////////////////////////////////////////////////////////////////////////////////
// This can be used to print all properties of an object. Can be helpful if             //
// documentation is sparse or outdated...                                               //
//////////////////////////////////////////////////////////////////////////////////////////

function logProperties(object) {
  for (const element in object) {
    debug(`${element} [${typeof (object[element])}]`);
  }
}


//////////////////////////////////////////////////////////////////////////////////////////
// This draws a square-shaped icon to the given Cairo.Context of the given size. The    //
// name can either be an icon name from the current icon theme or a path to an image    //
// file. If neither is found, the given name is written to the image. The given font    //
// (like 'Sans') and textColor (an object with properties 'red', 'green' and 'blue' in  //
// the range 0..1) are used in this case. This is very useful for emojis like 😆 or 🌟!   //
//////////////////////////////////////////////////////////////////////////////////////////

function paintIcon(ctx, name, size, opacity, font, textColor) {

  // In this case, we will not draw anything...
  if (size <= 0) {
    return;
  }

  // First try to find the icon in the theme. This will also load images from disc if the
  // icon name is actually a file path.
  try {

    if (imports.gi.versions.Gtk === '3.0') {
      const theme = Gtk.IconTheme.get_default();
      const info  = theme.lookup_by_gicon(
          Gio.Icon.new_for_string(name), size, Gtk.IconLookupFlags.FORCE_SIZE);

      // We got something, paint it!
      if (info != null) {
        Gdk.cairo_set_source_pixbuf(ctx, info.load_icon(), 0, 0);
        ctx.paintWithAlpha(opacity);
        return;
      }

    } else {

      const theme     = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
      const paintable = theme.lookup_by_gicon(
          Gio.Icon.new_for_string(name), size, 1, Gtk.TextDirection.NONE,
          Gtk.IconLookupFlags.FORCE_SIZE);

      // We got something, paint it!
      if (paintable.get_file() != null && paintable.get_file().get_path() != null) {
        const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(
            paintable.get_file().get_path(), size, size);
        Gdk.cairo_set_source_pixbuf(ctx, pixbuf, 0, 0);

        // If it's a symbolic icon, we draw it with the provided text color.
        if (paintable.is_symbolic) {
          const pattern = ctx.getSource();
          ctx.setSourceRGBA(textColor.red, textColor.green, textColor.blue, opacity);
          ctx.mask(pattern);
        } else {
          ctx.paintWithAlpha(opacity);
        }

        return;
      }
    }
  } catch (error) {
    debug('Failed to draw icon \'' + name + '\': ' + error + '! Falling back to text...');
  }

  // If no icon was found, write it as plain text. We use a hard-coded font size of 12
  // here. This doesn't really matter as the text of the icon is scaled so that it covers
  // the entire icon anyways. So in theory any number should result in the same icon.
  // However, for some reason there are slight offsets in the text position with different
  // font sizes. With a font size of 12, emojis are centered quite well. With 11, they are
  // slightly shifted towards the right, for example.
  const fontDescription = Pango.FontDescription.from_string(font);
  fontDescription.set_size(Pango.units_from_double(12));

  const layout = PangoCairo.create_layout(ctx);
  layout.set_font_description(fontDescription);
  layout.set_alignment(Pango.Alignment.CENTER);
  layout.set_wrap(Pango.WrapMode.CHAR);
  layout.set_text(name, -1);

  // We created a one-line layout above. We now estimate a proper width for the layout so
  // that the text covers more ore less a square shaped region. For this we compute the
  // required surface area of the one-line layout and compute the size of a equally large
  // square. As this will underestimate the required width slightly, we add the line's
  // height as additional width. This works quite well in most cases.
  const lineExtents = layout.get_pixel_extents()[1];
  const squareSize  = Math.sqrt(Math.max(1, lineExtents.width * lineExtents.height));
  layout.set_width(Pango.units_from_double(squareSize + lineExtents.height));

  // Now we retrieve the new extents and make sure that the new layout is centered in our
  // icon. We limit the overall scale to 100, as really huge font sizes sometime seem to
  // break pango.
  const extents   = layout.get_pixel_extents()[1];
  const maxExtent = Math.max(extents.width, extents.height);
  const scale     = Math.min(100, size / maxExtent);

  ctx.setSourceRGBA(textColor.red, textColor.green, textColor.blue, opacity);
  ctx.scale(scale, scale);
  ctx.translate(-extents.x, -extents.y);
  ctx.translate((maxExtent - extents.width) / 2, (maxExtent - extents.height) / 2);

  // We draw to a group to be able to paint emojis with opacity. Is there any other way of
  // doing this?
  ctx.pushGroup();
  PangoCairo.update_layout(ctx, layout);
  PangoCairo.show_layout(ctx, layout);
  ctx.popGroupToSource();
  ctx.paintWithAlpha(opacity);
}

//////////////////////////////////////////////////////////////////////////////////////////
// This creates a new square-shaped Cairo.ImageSurface of the given size and draws an   //
// icon to it. The name can either be an icon name from the current icon theme or a     //
// path to an image file. If neither is found, the given name is written to the image.  //
// The given font (like 'Sans') and textColor (an object with properties 'red', 'green' //
// and 'blue' in the range 0..1) are used in this case. This is very useful for emojis  //
// like 😆 or 🌟!                                                                         //
//////////////////////////////////////////////////////////////////////////////////////////

function createIcon(name, size, font, textColor) {
  const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, size, size);
  const ctx     = new Cairo.Context(surface);
  paintIcon(ctx, name, size, 1, font, textColor);

  // Explicitly tell Cairo to free the context memory. Is this really necessary?
  // https://wiki.gnome.org/Projects/GnomeShell/Extensions/TipsOnMemoryManagement#Cairo
  ctx.$dispose();

  return surface;
}

//////////////////////////////////////////////////////////////////////////////////////////
// Returns an [r, g, b], with each element [0...255] representing an average color for  //
// a given Cairo.Surface. This is based on code from Gnome-Pie.                         //
//////////////////////////////////////////////////////////////////////////////////////////

function getAverageIconColor(iconSurface, iconSize) {

  // surface.get_data() as well as surface.get_width() are not available somehow. Therefor
  // we have to pass in the icon size and use the pixbuf conversion below.
  const pixbuf = Gdk.pixbuf_get_from_surface(iconSurface, 0, 0, iconSize, iconSize);
  const pixels = pixbuf.get_pixels();
  const count  = pixels.length;

  let total = 0, rTotal = 0, gTotal = 0, bTotal = 0;

  for (let i = 0; i < count; i += 4) {
    const r = pixels[i + 0] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;
    const a = pixels[i + 3] / 255;

    // Put mor weight on non-transparent and more saturated colors.
    const saturation = Math.max(r, Math.max(g, b)) - Math.min(r, Math.min(g, b));
    const relevance  = 0.1 + 0.9 * a * saturation;

    rTotal += r * relevance;
    gTotal += g * relevance;
    bTotal += b * relevance;

    total += relevance;
  }

  // Create an array based on the calculated values.
  return [rTotal / total * 255, gTotal / total * 255, bTotal / total * 255];
}

//////////////////////////////////////////////////////////////////////////////////////////
// A simple convenience method to convert a string to a Gdk.RGBA                        //
//////////////////////////////////////////////////////////////////////////////////////////

function stringToRGBA(string) {
  const rgba = new Gdk.RGBA();
  rgba.parse(string);
  return rgba;
}


//////////////////////////////////////////////////////////////////////////////////////////
// This rounds the given number to the nearest multiple of base. This works for integer //
// and floating point values and both for positive and negative numbers.                //
//////////////////////////////////////////////////////////////////////////////////////////

function roundToMultiple(number, base) {
  return ((number % base) > base / 2) ? number + base - number % base :
                                        number - number % base;
}


//////////////////////////////////////////////////////////////////////////////////////////
// This method receives an array of objects, each representing an item in a menu level. //
// For each item it computes an angle defining the direction in which the item should   //
// be rendered. The angles are returned in an array (of the same length as the input    //
// array). If an item in the input array already has an 'angle' property, this is       //
// considered a fixed angle and all others are distributed more ore less evenly around. //
// This method also reserves the required angular space for the back navigation link to //
// the parent item (if given). Angles in items are always in degrees, 0° is on the top, //
// 90° on the right, 180° on the bottom and so on. This method may return null if for   //
// some reason the angles could not be computed. For instance, this would be the case   //
// if the fixed angles are not monotonically increasing.                                //
//////////////////////////////////////////////////////////////////////////////////////////

function computeItemAngles(items, parentAngle) {

  const itemAngles = [];

  // Shouldn't happen, but who knows...
  if (items.length == 0) {
    return itemAngles;
  }

  // First we calculate all angles for the current menu level. We begin by storing all
  // fixed angles.
  const fixedAngles = [];
  items.forEach((item, index) => {
    if ('angle' in item && item.angle >= 0) {
      fixedAngles.push({angle: item.angle, index: index});
    }
  });

  // Make sure that the parent link does not collide with a fixed item. For now, we
  // just move the fixed angle a tiny bit. This is somewhat error-prone as it may
  // collide with another fixed angle now. Maybe this could be solved in a better way?
  // Maybe some global minimum angular spacing of items?
  if (parentAngle != undefined) {
    for (let i = 0; i < fixedAngles.length; i++) {
      if (Math.abs(fixedAngles[i].angle - parentAngle) < 0.0001) {
        fixedAngles[i].angle += 0.1;
      }
    }
  }

  // Make sure that the fixed angles increase monotonically and are between 0° and 360°.
  for (let i = 0; i < fixedAngles.length; i++) {
    if (i > 0 && fixedAngles[i].angle <= fixedAngles[i - 1].angle) {
      return null;
    }

    if (fixedAngles[i].angle < 0.0 || fixedAngles[i].angle >= 360.0) {
      return null;
    }
  }

  // If no item has a fixed angle, we assign one to the first item. If there is no
  // parent item, this is on the top (0°). Else, the angular space will be evenly
  // distributed to all child items and the first item will be the one closest to the
  // top.
  if (fixedAngles.length == 0) {
    let firstAngle = 0;
    if (parentAngle != undefined) {
      const wedgeSize  = 360 / (items.length + 1);
      let minAngleDiff = 360;
      for (let i = 0; i < items.length; i++) {
        const angle     = (parentAngle + (i + 1) * wedgeSize) % 360;
        const angleDiff = Math.min(angle, 360 - angle);

        if (angleDiff < minAngleDiff) {
          minAngleDiff = angleDiff;
          firstAngle   = (angle + 360) % 360;
        }
      }
    }
    fixedAngles.push({angle: firstAngle, index: 0});
    itemAngles[0] = firstAngle;
  }

  // Now we iterate through the fixed angles, always considering wedges between
  // consecutive pairs of fixed angles. If there is only one fixed angle, there is also
  // only one 360°-wedge.
  for (let i = 0; i < fixedAngles.length; i++) {
    let wedgeBeginIndex = fixedAngles[i].index;
    let wedgeBeginAngle = fixedAngles[i].angle;
    let wedgeEndIndex   = fixedAngles[(i + 1) % fixedAngles.length].index;
    let wedgeEndAngle   = fixedAngles[(i + 1) % fixedAngles.length].angle;

    // The fixed angle can be stored in our output.
    itemAngles[wedgeBeginIndex] = wedgeBeginAngle;

    // Make sure we loop around.
    if (wedgeEndAngle <= wedgeBeginAngle) {
      wedgeEndAngle += 360;
    }

    // Calculate the number of items between the begin and end indices.
    let wedgeItemCount =
        (wedgeEndIndex - wedgeBeginIndex - 1 + items.length) % items.length;

    // We have one item more if the parent link is inside our wedge.
    let parentInWedge = false;

    if (parentAngle != undefined) {
      // It can be that the parent link is inside the current wedge, but it's angle is
      // one full turn off.
      if (parentAngle < wedgeBeginAngle) {
        parentAngle += 360;
      }

      parentInWedge = parentAngle > wedgeBeginAngle && parentAngle < wedgeEndAngle;
      if (parentInWedge) {
        wedgeItemCount += 1;
      }
    }

    // Calculate the angular difference between consecutive items in the current wedge.
    const wedgeItemGap = (wedgeEndAngle - wedgeBeginAngle) / (wedgeItemCount + 1);

    // Now we assign an angle to each item between the begin and end indices.
    let index             = (wedgeBeginIndex + 1) % items.length;
    let count             = 1;
    let parentGapRequired = parentInWedge;

    while (index != wedgeEndIndex) {
      let itemAngle = wedgeBeginAngle + wedgeItemGap * count;

      // Insert gap for parent link if required.
      if (parentGapRequired && itemAngle + wedgeItemGap / 2 - parentAngle > 0) {
        count += 1;
        itemAngle         = wedgeBeginAngle + wedgeItemGap * count;
        parentGapRequired = false;
      }

      itemAngles[index] = itemAngle % 360;

      index = (index + 1) % items.length;
      count += 1;
    }
  }

  return itemAngles;
}