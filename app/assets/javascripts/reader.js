$(document).ready(function() {
  Reader.init();
});

var Reader = {
  init: function() {
    Reader.get_subscriptions();
  },
  get_subscriptions: function() {
    $.getJSON(Urls.subscription_list(), function(data) {
      alert(data);
    });
  }
};

var Urls = {
  params: {
    output: "json",
    client: "Reader/0.1.0"
  },
  subscription_list: function() {
    return "http://www.google.com/reader/api/0/subscription/list?output=" + Urls.params.output + "&client=" + Urls.params.client;
  }
};
