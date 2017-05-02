class Points {
  static serialize(obj) {
    if(obj.hasOwnProperty('latitude')) {
      return obj.latitude + '.' + obj.longitude
    }
    else if (obj.hasOwnProperty('location')) {
      return obj.location.latitude + '.' + obj.location.longitude
    }
    else if (obj.hasOwnProperty('lat')) {
      return obj.lat + '.' + obj.lng;
    }
  }

  static toLatLng(obj) {
    if (obj.hasOwnProperty('location')) {
      return [obj.location.latitude, obj.location.longitude];
    } else if (obj.hasOwnProperty('latlng')) {
      return obj.latlng;
    }
  }

  static reverseSerialize(obj) {
    var out = [];
    $.each(obj, (k, v) => {
      var vals = JSON.parse(v);
      var latlng_r = k.split('.');
      var latlng = [Number(latlng_r[0] + "." + latlng_r[1]), Number(latlng_r[2] + "." + latlng_r[3])]
      out.push({
        image: vals[1],
        latlng: latlng
      })
    });
    return out;
  }

  startPoll(context) {
    var _this = context ? context : this;
    $.get('/sample')
    .done((res) => {
      $.each(Points.reverseSerialize(res), (i, v) => {
        _this.addPoint(v);
      });
    })

    _this.poller = setTimeout(_this.startPoll, 19000, _this);
  }

  addPoint(data, transient) {
    var popup = L.popup({
      autoClose: false,
      closeOnClick: false
    })
      .setLatLng(Points.toLatLng(data))
      .setContent('<img class="traffic-img" src="'+ data.image +'">')
      .addTo(this.map);

    setTimeout((popup) => {
      $(popup.getElement()).fadeOut(1000, function() {
        popup.remove();
      });
    }, 19000, popup);
  }

  click() {
    var key = Points.serialize(this.getLatLng());
    $.get('/loc/' + key)
    .done((res) => {
      var out = res.map(JSON.parse);
      var images = out.map((v) => { return v[1]});
      var modal = UIkit.modal("#show").show();
      var slider = $("#img-sel");
      var image = $("#shown-img");
      slider.val(images.length - 1);
      slider.attr("max", images.length - 1);
      image.attr("src", images[images.length - 1]);

      $("#show").on('hide', (e) => {
        slider.off('input');
      })

      slider.on('input', (e) => {
        image.attr("src", images[slider.val()]);
      })

    });
  }

  constructor(map) {
    this.map = map;
    this.icon = L.icon({
      iconUrl: '/static/dot.png',
      iconSize: [20, 20],
      className: 'icon'
    })
    this.markerOpts = {
      icon: this.icon
    };
    this.poller = null;
    $.get('/points')
    .done((res) => {
      this.markers = res.reduce((accum, latlng) => {
        var key = Points.serialize(latlng);
        accum[key] = L.marker([latlng.latitude, latlng.longitude],
                              {icon: this.icon})
                              .addTo(map)
                              .on('click', this.click);
        return accum;
      }, {})
    })
  }
}

var socket = io(window.location.href);

function main() {
  var map = L.map('map', {
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    minZoom: 12
  })
  map.setView([1.3521, 103.8198], 12);
  L.tileLayer.provider('CartoDB.DarkMatter').addTo(map);
  var points = new Points(map);

  points.startPoll();

  socket.on('new', (dat) => {
    points.addPoint(dat);
  })
}


$(() => {
  main();
})
