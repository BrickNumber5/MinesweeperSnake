// MinesweeperSnake Core Game Logic

const CELLSIZE = 15;

const cnv = document.querySelector( ".main canvas" );
const ctx = cnv.getContext( "2d" );
let width, height;
setCanvasSize( );

let snakeX = 0,
    snakeY = 0;

let cameraX = 0,
    cameraY = 0;

const DIRECTION = {
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3
};

function dirToVector( dir ) {
  switch ( dir ) {
    case DIRECTION.UP:
      return [  0, -1 ];
    case DIRECTION.RIGHT:
      return [  1,  0 ];
    case DIRECTION.DOWN:
      return [  0,  1 ];
    case DIRECTION.LEFT:
      return [ -1,  0 ];
  }
}

let snakeDir = DIRECTION.RIGHT;

let snake;

window.onresize = setCanvasSize;
function setCanvasSize( ) {
  width  = cnv.width  = window.innerWidth;
  height = cnv.height = window.innerHeight;
}

function initGame {
  snakeX = 0;
  snakeY = 0;
  
  snakeDir = DIRECTION.RIGHT;
  
  snake = [ [ -2, 0 ], [ -1, 0 ], [ 0, 0 ] ];
  
  cameraX = 0;
  cameraY = 0;
}

// Core Loop
function draw( ) {
  requestAnimationFrame( draw );
}