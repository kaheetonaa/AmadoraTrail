import ImageTile from 'ol/source/ImageTile.js';
import Map from 'ol/Map.js';
import OSMXML from 'ol/format/OSMXML.js';
import VectorSource from 'ol/source/Vector.js';
import View from 'ol/View.js';
import { Circle as CircleStyle, Fill, Stroke, Style, Icon,Text } from 'ol/style.js';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer.js';
import { bbox as bboxStrategy } from 'ol/loadingstrategy.js';
import Feature from 'ol/Feature.js';
import { Point, LineString } from 'ol/geom.js';
import { fromLonLat, transform } from 'ol/proj.js';
import GPX from 'ol/format/GPX.js';
import Overlay from 'ol/Overlay.js';


let map = null;

var utils = {
  getNearest: function (coord) {
    var coord4326 = utils.to4326(coord);
    return new Promise(function (resolve, reject) {
      //make sure the coord is on street
      fetch(url_osrm_nearest + coord4326.join()).then(function (response) {
        // Convert to JSON
        return response.json();
      }).then(function (json) {
        if (json.code === 'Ok') resolve(json.waypoints[0].location);
        else reject();
      });
    });
  },
  createFeature: function (coord) {
    var feature = new Feature({
      type: 'place',
      geometry: new Point(fromLonLat(coord))
    });
    feature.setStyle(wayFindingStyles.icon);
    wayFindingSource.addFeature(feature);
  },
  createRoute: function (locations) {
    // route is ol.geom.LineString
    let polyline = new LineString(locations).transform('EPSG:4326', 'EPSG:3857');
    let feature = new Feature(polyline);
    feature.setStyle(wayFindingStyles.route);
    wayFindingSource.addFeature(feature);
    console.log(wayFindingSource.getFeatures())
  },
  to4326: function (coord) {
    let a = transform([
      parseFloat(coord[0]), parseFloat(coord[1])
    ], 'EPSG:3857', 'EPSG:4326');

    return a;
  },
  to3857: function (coord) {
    let a = transform([
      parseFloat(coord[0]), parseFloat(coord[1])
    ], 'EPSG:4326', 'EPSG:3857');

    return a;
  },
  downloadString: function (text, fileType, fileName) {
    var blob = new Blob([text], { type: fileType });

    var a = document.createElement('a');
    a.download = fileName;
    a.href = URL.createObjectURL(blob);
    a.dataset.downloadurl = [fileType, a.download, a.href].join(':');
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  },
  serialize: function (feature) {
    console.log(feature)
    var str = new GPX();

    let output = str.writeFeatures(feature, { featureProjection: map.getView().getProjection() });
    console.log(output);
    utils.downloadString(output, "gpx", "Output.gpx")
  }
};

var points = [],
  popover,
  element = document.getElementById('popup'),
  msg_el = document.getElementById('msg'),
  btn_add = document.getElementById('add'),
  btn_download = document.getElementById('download'),
  btn_undo = document.getElementById('undo'),
  url_osrm_nearest = 'https://router.project-osrm.org/nearest/v1/driving/',
  url_osrm_route = 'https://api.openrouteservice.org/v2/directions/foot-walking?api_key=5b3ce3597851110001cf6248813cfcafdf4f44bd81487daab2f2cbec',
  icon_url = 'https://cdn.rawgit.com/openlayers/ol3/master/examples/data/icon.png',
  wayFindingSource = new VectorSource(),
  wayFindingStyles = {
    route: new Style({
      stroke: new Stroke({
        width: 6, color: [255, 0, 0, 0.8]
      })
    }),
    icon: new Style({
        image: new CircleStyle({
          radius: 5,
          fill: new Fill({
            color: 'red'
          }),
          stroke: null,
        }),
      })
  },
  wayFindingVectorLayer = new VectorLayer({
    source: wayFindingSource
  });

const styles = {
  'artwork_type': {
    'graffiti': new Style({
      image: new CircleStyle({
        radius: 10,
        fill: new Fill({
          color: 'blue'
        }),
        stroke: null,
      }),
    }),
  },
};

const vectorSource = new VectorSource({
  format: new OSMXML(),
  loader: function (extent, resolution, projection, success, failure) {
    //const epsg4326Extent = transformExtent(extent, projection, 'EPSG:4326');
    const client = new XMLHttpRequest();
    client.open('POST', 'https://overpass-api.de/api/interpreter');
    client.addEventListener('load', function () {
      const features = new OSMXML().readFeatures(client.responseText, {
        featureProjection: map.getView().getProjection(),
      });
      vectorSource.addFeatures(features);
      success(features);
    });
    client.addEventListener('error', failure);
    const query =
      '[timeout:25];area(id:3605400888)->.searchArea;node["artwork_type"="graffiti"](area.searchArea);out meta;';
    client.send(query);
  },
  strategy: bboxStrategy,
});

const vector = new VectorLayer({
  source: vectorSource,
  style: function (feature) {
    for (const key in styles) {
      const value = feature.get(key);
      if (value !== undefined) {
        for (const regexp in styles[key]) {
          if (new RegExp(regexp).test(value)) {
            return styles[key][regexp];
          }
        }
      }
    }
    return null;
  },
});

const attributions =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>';

const raster = new TileLayer({
  source: new ImageTile({
    attributions: attributions,
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileSize: 256,
    maxZoom: 20,
  }),
});

const popup = new Overlay({
  element: element,
  positioning: 'bottom-center',
  stopEvent: false,
});

function disposePopover() {
  if (popover) {
    popover.dispose();
    popover = undefined;
  }
}

map = new Map({
  layers: [raster, vector, wayFindingVectorLayer],
  target: document.getElementById('map'),
  view: new View({
    projection: 'EPSG:3857',
    center: utils.to3857([-9.2241307, 38.75594191880209]),
    maxZoom: 20,
    zoom: 18,
    minZoom: 15,
    constrainResolution: true
  }),
});

map.addOverlay(popup);

map.on('click', function (evt) {
  const feature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
    return feature;
  });
  disposePopover();
  if (!feature) {
    return;
  }
  let content =""
  if (feature.get('name')!=null) {
    content+="<b>"+feature.get('name')+"</b><br>";
  }
  if (feature.get('image')!=null) {
    content+="<img src='"+feature.get('image')+"' width=200/><br>"
  }

  if (feature.get('note')!=null && feature.get('note').toLowerCase().includes('euthmappers')) {
    content+="Mapped by EUthMappers"
  }
  popup.setPosition(evt.coordinate);
  popover = new bootstrap.Popover(element, {
    placement: 'top',
    html: true,
    content: content,
  });
  popover.show();
});

map.on('pointermove', function (e) {
  const hit = map.hasFeatureAtPixel(e.pixel);
  map.getTarget().style.cursor = hit ? 'pointer' : '';
});
// Close the popup when the map is moved
map.on('movestart', disposePopover);

btn_add.addEventListener('click', function () {
  let coord_street = transform(map.getView().getCenter(), 'EPSG:3857', 'EPSG:4326');
  //utils.getNearest(evt.coordinate).then(function(coord_street){
  var last_point = points[points.length - 1];
  var points_length = points.push(coord_street);

  utils.createFeature(coord_street);


  if (points_length < 2) {
    msg_el.innerHTML = 'Click to add another point';
    return;
  }

  //get the route
  var point1 = last_point.join();
  var point2 = coord_street.join();

  fetch(url_osrm_route + '&start=' + point1 + '&end=' + point2).then(function (r) {
    return r.json();
  }).then(function (json) {
    let polyline = json['features'][0].geometry.coordinates;
    console.log(polyline)
    if (json['error']) {
      msg_el.innerHTML = 'No route found.';
      return;
    }
    msg_el.innerHTML = 'Route added';
    //points.length = 0;

    utils.createRoute(polyline);
  });
  //});
});

btn_download.addEventListener('click', () => {
  utils.serialize(wayFindingSource.getFeatures())
})

btn_undo.addEventListener('click', () => {
  msg_el.innerHTML = 'Add point to start the trip.';
  let features = wayFindingSource.getFeatures();
  points.pop();
  console.log(features.length)
  wayFindingSource.removeFeature(features[features.length - 1]);
  wayFindingSource.removeFeature(features[features.length - 2]);
})


