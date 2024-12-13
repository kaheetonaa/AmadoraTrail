import ImageTile from 'ol/source/ImageTile.js';
import Map from 'ol/Map.js';
import OSMXML from 'ol/format/OSMXML.js';
import VectorSource from 'ol/source/Vector.js';
import View from 'ol/View.js';
import {Circle as CircleStyle, Fill, Stroke, Style,Icon} from 'ol/style.js';
import {Tile as TileLayer, Vector as VectorLayer} from 'ol/layer.js';
import {bbox as bboxStrategy} from 'ol/loadingstrategy.js';
import Feature from 'ol/Feature.js';
import {Point} from 'ol/geom.js';
import {fromLonLat,transform} from 'ol/proj.js';
import Polyline from 'ol/format/Polyline.js';

let map = null;

var utils = {
  getNearest: function(coord){
    var coord4326 = utils.to4326(coord);    
    return new Promise(function(resolve, reject) {
      //make sure the coord is on street
      fetch(url_osrm_nearest + coord4326.join()).then(function(response) { 
        // Convert to JSON
        return response.json();
      }).then(function(json) {
        if (json.code === 'Ok') resolve(json.waypoints[0].location);
        else reject();
      });
    });
  },
  createFeature: function(coord) {
    var feature = new Feature({
      type: 'place',
      geometry: new Point(fromLonLat(coord))
    });
    feature.setStyle(wayFindingStyles.icon);
    wayFindingSource.addFeature(feature);
  },
  createRoute: function(polyline) {
    // route is ol.geom.LineString
    var route = new Polyline({
      factor: 1e5
    }).readGeometry(polyline, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    });
    var feature = new Feature({
      type: 'route',
      geometry: route
    });
    feature.setStyle(wayFindingStyles.route);
    wayFindingSource.addFeature(feature);
  },
  to4326: function(coord) {
    let a= transform([
      parseFloat(coord[0]), parseFloat(coord[1])
     ], 'EPSG:3857', 'EPSG:4326');

    return a;  
  },
  to3857: function(coord) {
    let a= transform([
      parseFloat(coord[0]), parseFloat(coord[1])
     ], 'EPSG:4326', 'EPSG:3857');

    return a;  
  }
};

var points = [],
    msg_el = document.getElementById('msg'),
    url_osrm_nearest = 'https://router.project-osrm.org/nearest/v1/driving/',
    url_osrm_route = 'https://router.project-osrm.org/route/v1/driving/',
    icon_url = 'https://cdn.rawgit.com/openlayers/ol3/master/examples/data/icon.png',
    wayFindingSource = new VectorSource(),
    wayFindingVectorLayer = new VectorLayer({
      source: wayFindingSource
    }),
    wayFindingStyles = {
      route: new Style({
        stroke: new Stroke({
          width: 6, color: [40, 40, 40, 0.8]
        })
      }),
      icon: new Style({
        image: new Icon({
          anchor: [0.5, 1],
          src: icon_url
        })
      })
    };

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

  

map = new Map({
  layers: [raster, vector,wayFindingVectorLayer],
  target: document.getElementById('map'),
  view: new View({
    projection: 'EPSG:3857',
    center: utils.to3857([-9.2241307,38.75594191880209]),
    maxZoom: 19,
    zoom: 17,
  }),
});


map.on('click', function(evt){
  utils.getNearest(evt.coordinate).then(function(coord_street){
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
    
    fetch(url_osrm_route + point1 + ';' + point2).then(function(r) { 
      return r.json();
    }).then(function(json) {
      if(json.code !== 'Ok') {
        msg_el.innerHTML = 'No route found.';
        return;
      }
      msg_el.innerHTML = 'Route added';
      //points.length = 0;
      utils.createRoute(json.routes[0].geometry);
    });
  });
});

