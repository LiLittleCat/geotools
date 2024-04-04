import "../../styles/map.css";

import mapboxgl from "mapbox-gl";

export function map() {
  mapboxgl.accessToken =
    "pk.eyJ1Ijoic3ZjLW9rdGEtbWFwYm94LXN0YWZmLWFjY2VzcyIsImEiOiJjbG5sMnExa3kxNTJtMmtsODJld24yNGJlIn0.RQ4CHchAYPJQZSiUJ0O3VQ";

  const map = new mapboxgl.Map({
    container: "map", // container ID
    style: "mapbox://styles/mapbox/streets-v9", // style URL
    projection: "globe", // Display the map as a globe
    zoom: 1, // starting zoom
    center: [30, 15], // starting position [lng, lat]
  });

  map.addControl(new mapboxgl.NavigationControl());
  // map.scrollZoom.disable();

  map.on("style.load", () => {
    map.setFog({}); // Set the default atmosphere style
  });

  // The following values can be changed to control rotation speed:
  // At low zooms, complete a revolution every two minutes.
  const secondsPerRevolution = 240;
  // Above zoom level 5, do not rotate.
  const maxSpinZoom = 5;
  // Rotate at intermediate speeds between zoom levels 3 and 5.
  const slowSpinZoom = 3;

  let userInteracting = false;
  const spinEnabled = true;

  function spinGlobe() {
    const zoom = map.getZoom();
    if (spinEnabled && !userInteracting && zoom < maxSpinZoom) {
      let distancePerSecond = 360 / secondsPerRevolution;
      if (zoom > slowSpinZoom) {
        // Slow spinning at higher zooms
        const zoomDif = (maxSpinZoom - zoom) / (maxSpinZoom - slowSpinZoom);
        distancePerSecond *= zoomDif;
      }
      const center = map.getCenter();
      center.lng -= distancePerSecond;
      // Smoothly animate the map over one second.
      // When this animation is complete, it calls a 'moveend' event.
      map.easeTo({ center, duration: 1000, easing: (n) => n });
    }
  }

  // Pause spinning on interaction
  map.on("mousedown", () => {
    userInteracting = true;
  });
  map.on("dragstart", () => {
    userInteracting = true;
  });

  // When animation is complete, start spinning if there is no ongoing interaction
  map.on("moveend", () => {
    spinGlobe();
  });

  spinGlobe();
}