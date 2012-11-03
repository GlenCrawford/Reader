$(function() {
  Reader.init();
});

// Begin Reader class (singleton).
var Reader = {
  client: "Reader/0.1.0",
  update_interval: 180, // In seconds.
  animate_item_interval: 15, // In seconds.
  title_text: document.title,
  subscriptions: [],
  init: function() {
    $.ajaxSetup({
      beforeSend: function(xhr, settings) {
        var csrf_token = $("meta[name='csrf-token']").attr("content");
        xhr.setRequestHeader("X-CSRF-Token", csrf_token);
      }
    });
    View.login_form(function(email, password) {
      Reader.authenticate(email, password, function() {
        Subscription.get_subscriptions(true);
      });
    });
  },
  authenticate: function(email, password, callback) {
    $.post(Url("authenticate"), {
      service: "reader",
      Email: email,
      Passwd: password,
      source: Reader.client,
      continue: "http://www.google.com/"
    }, callback, "text");
  },
  get_edit_token: function(callback) {
    $.get(Url("edit_token"), function(data) {
      callback($.trim(data));
    });
  },
  total_unread_count: function() {
    var count = 0;
    $.each(Reader.subscriptions, function(index, subscription) {
      count += subscription.unread_count();
    });
    return count;
  },
  update_title: function() {
    var unread_count = Reader.total_unread_count();
    document.title = unread_count > 0 ? ("(" + unread_count + ") " + Reader.title_text) : Reader.title_text;
  }
};
// End Reader class.

// Begin Url class.
function Url(url_name) {
  var Urls = {
    proxy: "/proxy/",
    params: {
      output: "json",
      client: Reader.client,
      n: 9999, // Number of items to get.
      ck: function() {
        return (new Date()).getTime();
      }
    },
    authenticate: "https://www.google.com/accounts/ClientLogin",
    subscription_list: "http://www.google.com/reader/api/0/subscription/list?output=?&client=?&ck=?",
    unread_items_for_subscription: function(args) {
      var subscription = args[0];
      return "http://www.google.com/reader/atom/" + subscription.id + "?n=?&client=?&ck=?&xt=user/-/state/com.google/read";
    },
    unread_items: "http://www.google.com/reader/atom/user/-/state/com.google/reading-list?n=?&client=?&ck=?&xt=user/-/state/com.google/read",
    edit_token: "http://www.google.com/reader/api/0/token?ck=?&client=?",
    edit_tag: "http://www.google.com/reader/api/0/edit-tag?client=?"
  };

  var url = Urls[url_name];

  // If the URL is a function, execute it to get it as a string, passing
  // in all the arguments that this function received, except the first one.
  if (typeof(url) === "function") {
    args = Array.prototype.slice.call(arguments).splice(1);
    url = url(args);
  }

  // Replace the placeholders in the URL with the correct param values.
  $.each(Urls.params, function(key, value) {
    // If the param value is a function, execute it.
    if (typeof(value) === "function") {
      value = value();
    }

    var url_portion = key + "=?";
    url = url.replace(url_portion, (url_portion.slice(0, -1) + value));
  });

  return Urls.proxy + encodeURIComponent(url);
}
// End Url class.

// Begin Subscription class.
function Subscription(id, title, url) {
  this.id = id;
  this.title = title;
  this.url = url;
  this.items = [];
  this.$element = null;
  this.color = null;

  this.add_item = function(item, notify) {
    // Only if the subscription doesn't already have the item.
    if (!this.has_item(item.id)) {
      this.items.push(item);
      // If true (probably on the first batch of items), show
      // a desktop notification to alert the user.
      if (notify) {
        Notifier.notify((item.image() || ""), item.subscription.title, item.title);
      }
    }
  };

  this.remove_item = function(item) {
    var index = this.items.indexOf(item);
    if (index != -1) {
      this.items.splice(index, 1);
    }
  };

  this.find_item = function(id) {
    var the_item = null;
    $.each(this.items, function(index, item) {
      if (item.id == id) {
        the_item = item;
        return false;
      }
    });
    return the_item;
  };

  this.has_item = function(id) {
    return !!this.find_item(id);
  };

  this.unread_count = function() {
    return this.items.length;
  };
}

Subscription.find_subscription = function(id) {
  var the_subscription = null;
  $.each(Reader.subscriptions, function(index, subscription) {
    if (subscription.id == id) {
      the_subscription = subscription;
      return false;
    }
  });
  return the_subscription;
};

Subscription.sort = function(subscription1, subscription2) {
  var title1 = subscription1.title.toLowerCase();
  var title2 = subscription2.title.toLowerCase();

  if (title1 < title2) {
    return -1;
  }
  if (title1 > title2) {
    return 1;
  }
  return 0;
};

Subscription.get_subscriptions = function(is_init) {
  $.getJSON(Url("subscription_list"), function(data) {
    $.each(data.subscriptions, function(index, subscription) {
      Reader.subscriptions.push(new Subscription(subscription.id, subscription.title, subscription.htmlUrl));
    });
    Reader.subscriptions.sort(Subscription.sort);
    Subscription.get_unread_items(is_init);
  });
};

Subscription.get_unread_items = function(is_init) {
  $.get(Url("unread_items"), function(data) {
    // Get all the items that we currently have.
    var existing_items = Item.all();
    var new_items = [];

    $.each(data.documentElement.getElementsByTagName("entry"), function(index, entry) {
      var id = entry.getElementsByTagName("id")[0].firstChild.nodeValue;

      var title = entry.getElementsByTagName("title")[0].firstChild.nodeValue;

      var published = entry.getElementsByTagName("published")[0].firstChild.nodeValue;
      published = Utilities.convert_utc_timestamp_to_date(published);

      var updated = entry.getElementsByTagName("updated")[0].firstChild.nodeValue;
      updated = Utilities.convert_utc_timestamp_to_date(updated);

      var links = $.map(entry.getElementsByTagName("link"), function(link, index) {
        return {
          type: link.attributes.getNamedItem("rel").nodeValue,
          url: link.attributes.getNamedItem("href").nodeValue
        };
      });
      links.pop(); // Remove the last one, which we don't want.

      var summary = entry.getElementsByTagName("summary")[0];
      summary = summary ? summary.firstChild.nodeValue : null;

      var content = entry.getElementsByTagName("content")[0];
      content = content ? content.firstChild.nodeValue : null;

      var author = null;
      if (!entry.getElementsByTagName("author")[0].attributes.getNamedItem("gr:unknown-author")) {
        author = entry.getElementsByTagName("author")[0].getElementsByTagName("name")[0].firstChild.nodeValue;
      }

      var subscription_id = entry.getElementsByTagName("source")[0].attributes.getNamedItem("gr:stream-id").nodeValue;
      var subscription = Subscription.find_subscription(subscription_id);

      var item = new Item(id, title, published, updated, links, summary, content, author, subscription);

      new_items.push(item);
      subscription.add_item(item, (!is_init));
    });

    // Find any items that we had before we polled for items, that weren't in the
    // returned items, so that we can remove them.
    // First, gather the IDs of the items that we received.
    var new_item_ids = $.map(new_items, function(item) {
      return item.id;
    });
    // Then loop over the items that we already had.
    $.each(existing_items, function(index, existing_item) {
      // If the ID of this existing item is not in the array of new item IDs.
      if ($.inArray(existing_item.id, new_item_ids) == -1) {
        // Mark the item as read.
        existing_item.mark_as_read();
      }
    });

    $.each(Reader.subscriptions, function(index, subscription) {
      subscription.items.sort(Item.sort);
    });

    Reader.update_title();
    View.update_items(!!is_init);

    if (!!is_init) {
      setInterval(Subscription.get_unread_items, (Reader.update_interval * 1000));
    }
  }, "xml");
};
// End Subscription class.

// Begin Item class.
function Item(id, title, published_at, updated_at, links, summary, content, author, subscription) {
  this.id = id;
  this.title = title;
  this.published_at = published_at;
  this.updated_at = updated_at;
  this.links = links;
  this.summary = summary;
  this.content = content;
  this.author = author;
  this.subscription = subscription;
  this.$element = null;
  this.color = null;

  this.is_wide = function() {
    return this.title.length > 80;
  };

  this.has_image = function() {
    return !!this.image();
  };

  this.image = function() {
    var image = null;
    // Look for an image in item's links.
    $.each(this.links, function(index, link) {
      $.each(["jpg", "jpeg", "png", "gif"], function(index, extension) {
        if (link.url.indexOf("." + extension) != -1) {
          image = link.url;
          return false;
        }
      });
    });
    // If we found one, return here.
    if (image) {
      return image;
    }
    // If we still don't have an image, continue onto the summary and content.
    $.each([this.summary, this.content], function(index, text) {
      if (!text) {
        return true;
      }
      match = text.match(/https?:\/\/.*\.(?:jpg|jpeg|png|gif)/i);
      if (match && match[0]) {
        image = match[0];
      }
    });
    return image;
  };

  this.mark_as_read = function() {
    this.subscription.remove_item(this);
    this.mark_as_read_in_google_reader();
    View.update_items(false);
    Reader.update_title();
  };

  this.mark_as_read_in_google_reader = function() {
    var item = this;
    Reader.get_edit_token(function(edit_token) {
      $.post(Url("edit_tag"), {
        i: item.id,
        a: "user/-/state/com.google/read",
        ac: "edit",
        T: edit_token
      }, function(data) {
        if ($.trim(data) != "OK") {
          // A failed attempt is most likely due to an expired
          // token, so just try again.
          item.mark_as_read_in_google_reader();
        }
      });
    });
  };

  this.source_url = function() {
    var url = null;
    $.each(this.links, function(index, link) {
      if (link.type == "alternate") {
        url = link.url;
        return false;
      }
    });
    return url;
  };
}

Item.find_item = function(id) {
  var the_item = null;
  $.each(Reader.subscriptions, function(index, subscription) {
    $.each(subscription.items, function(index, item) {
      if (item.id == id) {
        the_item = item;
        return false;
      }
    });
    if (the_item) {
      return false;
    }
  });
  return the_item;
};

Item.sort = function(item1, item2) {
  var published_at1 = item1.published_at;
  var published_at2 = item2.published_at;

  if (published_at1 < published_at2) {
    return -1;
  }
  if (published_at1 > published_at2) {
    return 1;
  }
  return 0;
};

Item.all = function() {
  return $.map(Reader.subscriptions, function(subscription) {
    return subscription.items;
  });
};
// End Item class.

// Begin Utilities class (singleton).
var Utilities = {
  convert_utc_timestamp_to_date: function(utc_timestamp) {
    var components = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(utc_timestamp);
    return new Date(Date.UTC(components[1], (components[2] - 1), components[3], components[4], components[5], components[6]));
  }
};
// End Utilities class.

// Begin View class (singleton).
var View = {
  $item_container: function() {
    return $("#item_container");
  },
  colors: ["1BA859", "EC7227", "67C111", "E2A018", "044E95", "CF274B", "019AAB", "6441B6", "00A238", "1BA1E2"],
  get_random_item_color: function() {
    var color_index = Math.floor(Math.random() * View.colors.length);
    return View.colors[color_index];
  },
  update_items: function(is_init) {
    View.$item_container().empty();
    $.each(Reader.subscriptions, function(index, subscription) {
      if (subscription.unread_count() == 0) {
        return true;
      }
      if (!subscription.color) {
        subscription.color = View.get_random_item_color();
      }
      subscription.$element = $("<div />")
        .addClass("item subscription")
        .html($("<div />").addClass("item_inner_wrap").text(subscription.title + " (" + subscription.unread_count() + ")"))
        .css("background-color", ("#" + subscription.color));
      View.$item_container().append(subscription.$element);
      $.each(subscription.items, function(index, item) {
        if (!item.color) {
          item.color = View.get_random_item_color();
        }
        item.$element = $("<div />")
          .addClass("item")
          .attr("item-id", item.id)
          .html(
            $("<div />")
              .addClass("item_inner_wrap")
              .html(item.title)
              .click(function(event) {
                event.stopImmediatePropagation();
                var item = Item.find_item($(this).parent(".item").attr("item-id"));
                View.show_item(item);
              })
          )
          .click(function() {
            var item = Item.find_item($(this).attr("item-id"));
            item.mark_as_read();
          });
        if (item.has_image()) {
          item.$element.prepend(
            $("<div />").addClass("item-background-overlay"),
            $("<div />")
              .addClass("item-background")
              .css("background-image", ("url('" + item.image() + "')"))
          );
        }
        item.$element.css("background-color", ("#" + item.color));
        if (item.is_wide()) {
          item.$element.addClass("item-wide");
        }
        View.$item_container().append(item.$element);
      });
    });
    View.normalize_item_element_widths();
    View.resize_items_to_fill_window();
    if (is_init) {
      View.set_animate_item_interval();
    }
  },
  show_item: function(item) {
    var $item_detail = $("#item_detail");
    var $item_title = $item_detail.find("h1");
    var $item_info = $item_detail.find("#item_detail_left_column #item_detail_info");
    var $item_content = $item_detail.find("#item_detail_right_column #item_detail_content");
    var $overlay = $("#overlay");

    $item_title.html(item.title);
    $item_content.html(item.content || item.summary);

    $item_info.find("#item_detail_info_subscription").html(item.subscription.title);
    $item_info.find("#item_detail_info_author").html(item.author ? item.author.toLowerCase() : "");
    $item_info.find("#item_detail_info_source_link").attr("href", item.source_url());
    $item_info.find("#item_detail_info_published_at").text("Published at " + View.format_date(item.published_at));
    $item_info.find("#item_detail_info_updated_at").text("Updated at " + View.format_date(item.updated_at));

    $item_title.css("border-color", ("#" + item.color));
    $item_info.css("background-color", ("#" + item.color));

    // If the image of the item is not already in the item_content div now, add it in.
    if ((item.image()) && ($item_content.html().indexOf(item.image()) == -1)) {
      $item_content.prepend(
        $("<img />")
          .attr("src", item.image())
          .attr("alt", item.title)
      );
    }

    $item_info.find("#item_detail_info_mark_as_read")
      .off("click")
      .click(function() {
        item.mark_as_read();
        $overlay.hide();
        $item_detail.hide();
        return false;
      });

    $item_detail.show();
    $overlay
      .show()
      .off("click")
      .click(function() {
        $overlay.hide();
        $item_detail.hide();
      });

    // Set the left column's height to equal the height of the right column.
    var $left_column = $item_detail.find("#item_detail_left_column");
    var $right_column = $item_detail.find("#item_detail_right_column");
    var padding_top = parseInt($left_column.find("#item_detail_info").css("padding-top").toString().replace("px", ""));
    var padding_bottom = parseInt($left_column.find("#item_detail_info").css("padding-bottom").toString().replace("px", ""));
    $left_column.css("height", "auto");
    $right_column.css("height", "auto");
    if ($right_column.height() > $left_column.height()) {
      $left_column.height($right_column.height() - (padding_top + padding_bottom));
    }
  },
  format_date: function(date) {
    // Get the hour and meridian indicator (AM/PM).
    var hour = date.getHours();
    var meridian_indicator = "am";
    if (hour >= 12) {
      meridian_indicator = "pm";
    }

    // Convert to 12-hour format.
    if (hour > 12) {
      hour -= 12;
    }
    if (hour == 0) {
      hour = 12;
    }

    // Make sure the minutes is always two digits.
    var minutes = date.getMinutes();
    if (minutes.toString().length == 1) {
      minutes = "0" + minutes;
    }

    // Get the day of the month and the ordinal indicator (st/nd/rd/th).
    var day = date.getDate();
    var ordinal_indicator;
    if ((day >= 11) && (day <= 19)) {
      ordinal_indicator = "th";
    }
    else {
      switch(parseInt(day.toString().charAt(day.toString().length - 1))) {
        case 1:
          ordinal_indicator = "st";
          break;
        case 2:
          ordinal_indicator = "nd";
          break;
        case 3:
          ordinal_indicator = "rd";
          break;
        default:
          ordinal_indicator = "th";
      }
    }

    // Get the name of the month.
    var month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][date.getMonth()];

    return hour + ":" + minutes + meridian_indicator + ", " + month + " " + day + ordinal_indicator;
  },
  login_form: function(callback) {
    var $login_box = $("#login");
    var $login_form = $login_box.find("form");
    var $login_email = $login_form.find("#login_email");
    var $login_password = $login_form.find("#login_password");

    $login_form.find(".form_line input")
      .focus(function() {
        $(this).parent(".form_line").addClass("active_form_line");
      })
      .blur(function() {
        $(this).parent(".form_line").removeClass("active_form_line");
      });
    $login_email.focus();
    $login_form.submit(function() {
      var email = $.trim($login_email.val());
      var password = $.trim($login_password.val());
      if ((email.length > 0) && (password.length > 0)) {
        callback(email, password);
        $("#login").remove();
      }
      return false;
    });
  },
  set_animate_item_interval: function() {
    View.animate_item();
    setInterval(View.animate_item, (Reader.animate_item_interval * 1000));
  },
  animate_item: function() {
    // Get all items that have images.
    var items_with_images = $.map(Reader.subscriptions, function(subscription, index) {
      var subscription_items_with_images = [];
      $.each(subscription.items, function(index, item) {
        if (item.has_image()) {
          subscription_items_with_images.push(item);
        }
      });
      return subscription_items_with_images;
    });

    // There are no items with images, so just stop here.
    if (items_with_images.length == 0) {
      return;
    }

    // Randomly pick one of those items.
    var item = items_with_images[Math.floor(Math.random() * items_with_images.length)];

    // Now we have a random item with an image, let's animate it.
    var $image = item.$element.find(".item-background");

    // First, get the heights of the item and the item text.
    var item_height = item.$element.height();
    var $item_text = item.$element.find(".item_inner_wrap");
    var item_text_height = ($item_text.height() + (parseInt($item_text.css("padding").replace("px", "")) * 2));

    // Calculate the direction and distance of the animation.
    var direction = ["up", "down"][Math.floor(Math.random() * 2)];
    var distance;

    if (direction == "up") {
      distance = (item_text_height * -1);
    }
    else if (direction == "down") {
      distance = (item_height - item_text_height);
    }

    // Set the animation options.
    var animation_options = {
      duration: 1500,
      easing: "swing"
    };

    // And finally, do the animations.
    $image.animate({"margin-top": distance}, $.extend({
      complete: function() {
        $image.delay(4000).animate({"margin-top": 0}, animation_options);
      }
    }, animation_options));
  },
  normalize_item_element_widths: function() {
    var element_rows = {};
    var all_elements = [];

    // Build up an array of all the elements on the screen.
    $.each(Reader.subscriptions, function(index, subscription) {
      if (subscription.$element) {
        all_elements.push(subscription);
      }
      $.each(subscription.items, function(index, item) {
        all_elements.push(item);
      });
    });

    // If there are no elements on the screen, stop here.
    if (all_elements.length == 0) {
      return;
    }

    // Sort each element into each row that they exist in on the screen.
    $.each(all_elements, function(index, element) {
      var row = element.$element.offset().top;
      if (!element_rows[row]) {
        element_rows[row] = [];
      }
      element_rows[row].push(element);
    });

    // Determine how many item elements there should be on a row, by counting how
    // many elements there are in each row on the screen (wide ones count as two),
    // and getting the highest even number.
    var num_elements_in_all_rows = [];
    $.each(element_rows, function(row, elements) {
      var num_elements_in_this_row = elements.length;
      $.each(elements, function(index, element) {
        if (element.$element.hasClass("item-wide")) {
          num_elements_in_this_row += 1;
        }
      });
      num_elements_in_all_rows.push(num_elements_in_this_row);
    });
    var optimal_elements_per_row = num_elements_in_all_rows.sort().reverse()[0];

    // Convert the row numbers to actual numbers (Object.keys returns strings),
    // and sort them numerically.
    var row_numbers = $.map(Object.keys(element_rows), function(row_number) {
      return parseInt(row_number);
    }).sort(function(a, b) {
      return a - b;
    });

    // Finally, for those rows that have less than the optimal number of elements
    // per row (except the last one), make the single-width item element with the
    // longest title a wide one to fill in the rest of the row.
    $.each(element_rows, function(row, elements) {
      // Skip the last row.
      if (row == row_numbers.slice(-1)[0]) {
        return false;
      }
      // Count how many elements there are in the row.
      var num_elements = elements.length;
      $.each(elements, function(index, element) {
        if (element.$element.hasClass("item-wide")) {
          num_elements += 1;
        }
      });
      // If this row has less than the optimal number of elements per row.
      if (num_elements < optimal_elements_per_row) {
        var element_to_widen = null;
        $.each(elements, function(index, element) {
          // Skip this element if it is a subscription.
          if (element.$element.hasClass("subscription")) {
            return true;
          }
          // Also skip if it is already a wide item.
          if (element.$element.hasClass("item-wide")) {
            return true;
          }
          // Find the single-width item element with the longest title.
          if ((element_to_widen == null) || (element.title.length >= element_to_widen.title.length)) {
            element_to_widen = element;
          }
        });
        // And finally, make that element a wide one to fill in the rest of the row, if we found one to widen.
        if (element_to_widen) {
          element_to_widen.$element.addClass("item-wide");
        }
      }
    });
  },
  resize_items_to_fill_window: function() {
    var $item_container = $("#item_container");
    var $items = $item_container.find(".item");

    // Stop here if there aren't any items on the screen.
    if ($items.length == 0) {
      return;
    }

    // Calculate the width of the item container, not including border, margin or padding.
    var item_container_left_padding = parseInt($item_container.css("padding-left").replace("px", ""));
    var item_container_right_padding = parseInt($item_container.css("padding-right").replace("px", ""));
    var item_container_width = $item_container.innerWidth() - item_container_left_padding - item_container_right_padding;

    // Calculate the total width needed per item.
    var item_left_margin = parseInt($items.css("margin-left").replace("px", ""));
    var item_right_margin = parseInt($items.css("margin-right").replace("px", ""));
    var item_width = $items.width() + item_left_margin + item_right_margin;

    // Find out how many items there already are per row.
    var num_items_on_a_row = Math.floor(item_container_width / item_width);

    // Now calculate how wide each item should be to fill up the width of the entire container.
    var optimal_item_width = Math.floor(item_container_width / num_items_on_a_row) - item_left_margin - item_right_margin;

    // And finally, set the new width (which is also the height) of the items.
    $items.width(optimal_item_width);
    $items.height(optimal_item_width);

    // And also the width of the wide items.
    $items.filter(".item-wide").width((optimal_item_width * 2) + item_left_margin + item_right_margin);
  }
};
// End View class.

// Begin Notifier class (singleton).
var Notifier = {
  has_support: function() {
    return !!window.webkitNotifications;
  },
  has_permission: function() {
    return window.webkitNotifications.checkPermission() == 0;
  },
  request_permission: function() {
    window.webkitNotifications.requestPermission();
  },
  notify: function(image, title, content) {
    if (Notifier.has_support() && Notifier.has_permission()) {
      var notification = window.webkitNotifications.createNotification(image, title, content);
      // Close the notification after a few seconds.
      notification.ondisplay = function(event) {
        setTimeout(function() {
          event.currentTarget.cancel();
        }, 5000);
      };
      notification.show();
    }
  }
};
// End Notifier class.
