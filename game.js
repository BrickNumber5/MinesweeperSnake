// MinesweeperSnake Core Game Logic

const TURNTIME = 350;

const CELLSIZE = 35;
const COLORS = {
  CLEARED: [ "#7bb7ff", "#56a3ff" ],
  SNAKE: "#840ebf"
}

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
      return { x:  0, y: -1 };
    case DIRECTION.RIGHT:
      return { x:  1, y:  0 };
    case DIRECTION.DOWN:
      return { x:  0, y:  1 };
    case DIRECTION.LEFT:
      return { x: -1, y:  0 };
  }
}

let snakeDir = DIRECTION.RIGHT;
let directionsQueue;

let snake;

initGame( );
requestAnimationFrame( draw );

window.onresize = setCanvasSize;
function setCanvasSize( ) {
  width  = cnv.width  = window.innerWidth;
  height = cnv.height = window.innerHeight;
}

function initGame( ) {
  // snakeX = 0;
  // snakeY = 0;
  snakeX = -4;
  snakeY = -3;
  
  // snakeDir = DIRECTION.RIGHT;
  snakeDir = DIRECTION.UP;
  directionsQueue = [ ];
  
  // snake = [ { x: -3, y: 0 }, { x: -2, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 0 } ];
  snake = [
    { x: -3, y: 0 },
    { x: -2, y: 0 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: -1 },
    { x: 0, y: -1 },
    { x: -1, y: -1 },
    { x: -2, y: -1 },
    { x: -3, y: -1 },
    { x: -3, y: 0 },
    { x: -3, y: 1 },
    { x: -3, y: 2 },
    { x: -3, y: 3 },
    { x: -4, y: 3 },
    { x: -4, y: 2 },
    { x: -4, y: 1 },
    { x: -4, y: 0 },
    { x: -4, y: -1 },
    { x: -4, y: -2 },
    { x: -4, y: -3 },
  ];
  
  cameraX = 0;
  cameraY = 0;
}

// Core Loop
let prevTime = -1, elapsedTime, timeSinceLastTurn = 0;
function draw( time ) {
  if ( prevTime === -1 ) {
    prevTime = time;
    requestAnimationFrame( draw );
    return;
  }
  elapsedTime = time - prevTime;
  prevTime = time;
  updateCamera( );
  drawGrid( );
  drawSnake( );
  timeSinceLastTurn += elapsedTime;
  if ( timeSinceLastTurn >= TURNTIME ) {
    timeSinceLastTurn -= TURNTIME;
    turnLogic( );
  }
  requestAnimationFrame( draw );
}

function drawGrid( ) {
  const xLower = Math.floor( cameraX - ( width  / 2 ) / CELLSIZE ),
        xUpper = Math.ceil(  cameraX + ( width  / 2 ) / CELLSIZE ),
        yLower = Math.floor( cameraY - ( height / 2 ) / CELLSIZE ),
        yUpper = Math.ceil(  cameraY + ( height / 2 ) / CELLSIZE ); 
  for ( let x = xLower; x < xUpper; x++ ) {
    let xCell = CELLSIZE * ( x - cameraX ) + width / 2;
    for ( let y = yLower; y < yUpper; y++ ) {
      let yCell = CELLSIZE * ( y - cameraY ) + height / 2;
      ctx.fillStyle = COLORS.CLEARED[ ( x + y ) & 1 ];
      ctx.fillRect( xCell, yCell, CELLSIZE, CELLSIZE );
    }
  }
}

function drawSnake( ) {
  ctx.strokeStyle = COLORS.SNAKE;
  ctx.lineWidth = CELLSIZE * 0.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath( );
  ctx.moveTo( CELLSIZE * ( snake[ 1 ].x - cameraX + 0.5 ) + width / 2, CELLSIZE * ( snake[ 1 ].y - cameraY + 0.5 ) + height / 2 );
  for ( let i = 1; i < snake.length; i++ ) {
    ctx.lineTo( CELLSIZE * ( snake[ i ].x - cameraX + 0.5 ) + width / 2, CELLSIZE * ( snake[ i ].y - cameraY + 0.5 ) + height / 2 );
  }
  ctx.stroke( );
}

function updateCamera( ) {
  let turnAnimation = timeSinceLastTurn / TURNTIME;
  cameraX = lerp( snake.at( -2 ).x, snakeX, turnAnimation ) + 0.5;
  cameraY = lerp( snake.at( -2 ).y, snakeY, turnAnimation ) + 0.5;
}

function turnLogic( ) {
  moveSnake( );
}

function moveSnake( ) {
  if ( directionsQueue.length > 0 ) snakeDir = directionsQueue.pop( );
  let vector = dirToVector( snakeDir );
  snakeX += vector.x;
  snakeY += vector.y;
  snake.push( { x: snakeX, y: snakeY } );
  snake.shift( );
}

window.addEventListener( "keydown", e => {
  let dir = null;
  switch( e.key ) {
    case "w":
    case "ArrowUp":
      dir = DIRECTION.UP;
      break;
    case "d":
    case "ArrowRight":
      dir = DIRECTION.RIGHT;
      break;
    case "s":
    case "ArrowDown":
      dir = DIRECTION.DOWN;
      break;
    case "a":
    case "ArrowLeft":
      dir = DIRECTION.LEFT;
      break;
  }
  if ( dir !== null && directionsQueue.length < 5 ) {
    let dq0 = directionsQueue[ 0 ] ?? snakeDir;
    if (
         ( ( dir === DIRECTION.UP   || dir === DIRECTION.DOWN  ) && ( dq0 === DIRECTION.LEFT || dq0 === DIRECTION.RIGHT ) )
      || ( ( dir === DIRECTION.LEFT || dir === DIRECTION.RIGHT ) && ( dq0 === DIRECTION.UP   || dq0 === DIRECTION.DOWN  ) )
    ) directionsQueue.unshift( dir );
  }
} );

const lerp = ( a, b, t ) => ( 1 - t ) * a + t * b;