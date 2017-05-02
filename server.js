let express = require('express')
let redis = require("redis");
let request = require("request");
let _ = require("lodash");
let socketio = require('socket.io');


let app = express()
let server = require('http').createServer(app);
let io = socketio(server);

let MAX_CACHE_NUM = 50;
let POLL_INTERVAL = 20000;

class DataGovAPI {
  constructor(key) {
    this._requestOpts = {
      'url': 'https://api.data.gov.sg/v1/transport/traffic-images',
      'headers' : {
        'api-key': key
      }
    }
  }

  getCurrentTrafficImages(callb) {
    request(this._requestOpts, callb);
  }
}

class Points {

  static serialize(obj) {
    if(obj.hasOwnProperty('latitude')) {
      return obj.latitude + '.' + obj.longitude
    }
    else if (obj.hasOwnProperty('location')) {
      return obj.location.latitude + '.' + obj.location.longitude
    }
  }

  constructor(api) {
    this.api = api;
    this.db = redis.createClient();
    this.locations = null;
    // update locations
    this.db.get("points", (err, res) => {
      if(!err) {
        if(res == null) {
          console.log("Points nonexistent, repopulating...");
          this.api.getCurrentTrafficImages((err, res) => {
            if(!err) {
              var output = JSON.parse(res.body);
              this.locations = _.map(output.items[0].cameras, (obj) => {
                return obj.location;
              });
              this.db.set("points", JSON.stringify(this.locations));
              this.pollAPI();
            }
          })
        } else {
          console.log("Points exist...");
          this.locations = JSON.parse(res);
          this.pollAPI();
        }
      }
    })
    this.poller = setInterval(this.pollAPI, POLL_INTERVAL, this);
  }

  insertImage(camera) {
    var key = Points.serialize(camera);
    var toInsert = JSON.stringify([camera.timestamp, camera.image]);
    this.db.multi()
      .llen(key)
      .lindex(key, 0)
      .exec((err, res) => {
      if(err) {
        console.log("DB error for key " + key);
      } else {
        if(res[1] == toInsert) {
          console.log("Key " + key + " not yet updated. Skipping.")
          return;
        }

        if(res[0] >= MAX_CACHE_NUM) {
          this.db.multi()
            .lpush(key, toInsert)
            .rpop(key)
            .exec((err, res) => {
              if(err) {
                console.log(err);
              } else {
                io.emit('new', camera);
              }
            })
        } else {
          this.db.lpush(key, toInsert, (err, res) => {
            if(err) {
              console.log(err);
            } else {
              io.emit('new', camera);
            }
          })
        }
      }
    });
  }

  pollAPI(callingObj) {
    //check if its poller or called directly
    var _this = callingObj ? callingObj : this;

    if(_this.locations == null) {
      console.log("Locations not yet retrieved.")
      return;
    }

    _this.api.getCurrentTrafficImages((err, res) => {
      if(err) {
        console.log(err);
      } else {
        var results = JSON.parse(res.body);
        console.log("Polled at " + res.headers.date + " (SGT)");
         _.map(results.items[0].cameras, (camera) => {
           _this.insertImage(camera);
         });
      }
    })
  }

}

var points = new Points(new DataGovAPI(KEY));

app.use('/static', express.static('static'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
})

app.get('/loc/:latlng', (req, res) => {
  points.db.lrange(req.params.latlng, 0, -1, (err, dat) => {
    res.json(dat);
  })
})

app.get('/sample', (req, res) => {
  var num = _.random(0, 8);
  var out_k = [];
  var out = {};
  var q = points.db.multi();

  for (var i = 0; i < num; i++) {
    var k = Points.serialize(points.locations[_.random(0,points.locations.length)]);
    out_k.push(k);
    q.lindex(k, 0);
  }

  q.exec((err, dat) => {
    _.forEach(dat, (v, i) => {
      out[out_k[i]] = v;
    })
    res.json(out);
  });

})

app.get('/points', (req, res) => {
  res.json(points.locations);
})

io.on('connection', (client) => {
  console.log("A client has connected!");
})

server.listen(3000, function () {
  console.log('Server app listening on port 3000!')
})
