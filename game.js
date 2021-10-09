// MinesweeperSnake Core Game Logic

let DEBUGMODE = false;

const lerp = ( a, b, t ) => ( 1 - t ) * a + t * b;
const mod  = ( a, n ) => ( ( a % n ) + n ) % n;
const sqrdist = ( x1, y1, x2, y2 ) => ( x2 - x1 ) ** 2 + ( y2 - y1 ) ** 2;
const dist = ( x1, y1, x2, y2 ) => Math.sqrt( sqrdist( x1, y1, x2, y2 ) );

const TURNTIME = 200;

const CELLSIZE = 35;
const COLORS = {
  CLEARED: [ "#7bb7ff", "#56a3ff" ],
  COVERED: [ "#475568", "#2b394c" ],
  SNAKE: "#840ebf",
  DEBUG: "#cc2222"
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

let usedCourtesyTurn = false;

const REGIONSIZE = 16;

let regions;

class Region {
  constructor( rx, ry, center = false ) {
    this.rx = rx;
    this.ry = ry;
    this.wx = rx * REGIONSIZE;
    this.wy = ry * REGIONSIZE;
    this.populate( center );
  }
  get( x, y ) {
    return this.cells[ x + y * REGIONSIZE ];
  }
  populate( center ) {
    const likelyhood = ( x, y ) => 1 / ( 3 * ( ( 1 + ( Math.E ** -( dist( x, y, 7.5, 7.5 ) / ( 4 * REGIONSIZE ) ) ) ) ** 3 ) );
    let that = this;
    if ( center ) {
      this.cells = Array.from( { length: REGIONSIZE * REGIONSIZE }, ( _, i ) => {
        let x = i % REGIONSIZE,
            y = Math.floor( i / REGIONSIZE );
        if ( x >= REGIONSIZE / 4 && x < REGIONSIZE - REGIONSIZE / 4 && y >= REGIONSIZE / 4 && y < REGIONSIZE - REGIONSIZE / 4 ) {
          return { mine: false, covered: false, number: null };
        } else {
          return {
            mine: Math.random( ) <= likelyhood( that.wx + ( i % REGIONSIZE ), that.wy + Math.floor( i / REGIONSIZE ) ),
            covered: true,
            number: null
          };
        }
      } );
    } else {
      this.cells = Array.from( { length: REGIONSIZE * REGIONSIZE }, ( _, i ) => ( {
        mine: Math.random( ) <= likelyhood( that.wx + ( i % REGIONSIZE ), that.wy + Math.floor( i / REGIONSIZE ) ),
        covered: true,
        number: null
      } ) );
    }
  }
}

initGame( );
requestAnimationFrame( draw );

window.onresize = setCanvasSize;
function setCanvasSize( ) {
  width  = cnv.width  = window.innerWidth;
  height = cnv.height = window.innerHeight;
}

function initGame( ) {
  snakeX = 0;
  snakeY = 0;
  
  snakeDir = DIRECTION.RIGHT;
  directionsQueue = [ ];
  
  // snake = [ { x: -3, y: 0 }, { x: -2, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 0 } ];
  snake = Array.from( { length: 100 }, ( _, i ) => ( { x: i - 99, y: 0 } ) );
  
  cameraX = 0;
  cameraY = 0;
  
  usedCourtesyTurn = false;
  
  regions = new Map( );
  regions.set( "0/0", new Region( 0, 0, true ) );
}

// Core Loop
let prevTime = -1, elapsedTime, timeSinceLastTurn = 0, updateCellsTimer = 0;
function draw( time ) {
  if ( prevTime === -1 || time - prevTime > 5000 ) {
    prevTime = time;
    requestAnimationFrame( draw );
    return;
  }
  
  elapsedTime = time - prevTime;
  prevTime = time;
  
  generateWorldAsNeeded( );
  updateCellsTimer++;
  if ( updateCellsTimer >= 5 ) {
    updateCellsTimer = 0;
    updateCells( );
  }
  
  updateCamera( );
  drawGrid( );
  if ( DEBUGMODE ) drawDebugRegions( );
  if ( DEBUGMODE ) drawDebugMines( );
  drawSnake( );
  
  timeSinceLastTurn += elapsedTime;
  if ( timeSinceLastTurn >= TURNTIME ) {
    timeSinceLastTurn -= TURNTIME;
    turnLogic( );
  }
  
  requestAnimationFrame( draw );
}

function updateCells( ) {
  const xLower = Math.floor( cameraX - width / CELLSIZE ),
        xUpper = Math.ceil(  cameraX + width / CELLSIZE ),
        yLower = Math.floor( cameraY - height / CELLSIZE ),
        yUpper = Math.ceil(  cameraY + height / CELLSIZE ); 
  for ( let x = xLower - 1; x < xUpper + 1; x++ ) {
    let xCell = CELLSIZE * ( x - cameraX ) + width / 2;
    for ( let y = yLower - 1; y < yUpper + 1; y++ ) {
      let yCell = CELLSIZE * ( y - cameraY ) + height / 2;
      let cell = regions.get( Math.floor( x / REGIONSIZE ) + "/" + Math.floor( y / REGIONSIZE ) ).get( mod( x, REGIONSIZE ), mod( y, REGIONSIZE )  );
      if ( cell.number !== null ) continue;
      if ( cell.mine ) {
        cell.number = -1;
        continue;
      }
      let num = 0;
      [ [ -1, -1 ], [ 0, -1 ], [ 1, -1 ], [ -1, 0 ], [ 1, 0 ], [ 1, -1 ], [ 1, 0 ], [ 1, 1 ] ].forEach( offset => {
        let nx = x + offset[ 0 ], ny = y + offset[ 1 ];
        let neighborCellCoordinate = Math.floor( nx / REGIONSIZE ) + "/" + Math.floor( ny / REGIONSIZE );
        let neighborCell = regions.get( neighborCellCoordinate ).get( mod( nx, REGIONSIZE ), mod( ny, REGIONSIZE )  );
        if ( neighborCell.mine ) num++;
      } );
      cell.number = num;
    }
  }
  for ( let x = xLower; x < xUpper; x++ ) {
    let xCell = CELLSIZE * ( x - cameraX ) + width / 2;
    for ( let y = yLower; y < yUpper; y++ ) {
      let yCell = CELLSIZE * ( y - cameraY ) + height / 2;
      let cell = regions.get( Math.floor( x / REGIONSIZE ) + "/" + Math.floor( y / REGIONSIZE ) ).get( mod( x, REGIONSIZE ), mod( y, REGIONSIZE ) );
      if ( !cell.covered || cell.mine ) continue;
      for ( let i = -1; i <= 1; i++ ) {
        for ( let j = -1; j <= 1; j++ ) {
          if ( i === 0 && j === 0 ) continue;
          let nx = x + i, ny = y + j;
          let neighborCellCoordinate = Math.floor( nx / REGIONSIZE ) + "/" + Math.floor( ny / REGIONSIZE );
          let neighborCell = regions.get( neighborCellCoordinate ).get( mod( nx, REGIONSIZE ), mod( ny, REGIONSIZE ) );
          if ( !neighborCell.covered && neighborCell.number === 0 ) cell.covered = false;
        }
      }
    }
  }
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
      let cell = regions.get( Math.floor( x / REGIONSIZE ) + "/" + Math.floor( y / REGIONSIZE ) ).get( mod( x, REGIONSIZE ), mod( y, REGIONSIZE )  );
      ctx.fillStyle = COLORS[ cell.covered ? "COVERED" : "CLEARED" ][ ( x + y ) & 1 ];
      ctx.fillRect( xCell, yCell, CELLSIZE, CELLSIZE );
    }
  }
}

function drawSnake( ) {
  let turnAnimation = timeSinceLastTurn / TURNTIME;
  let tailFrozen = usedCourtesyTurn,
      headFrozen = usedCourtesyTurn;
  ctx.strokeStyle = COLORS.SNAKE;
  ctx.lineWidth = CELLSIZE * 0.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath( );
  if ( tailFrozen ) {
    ctx.moveTo(
      CELLSIZE * ( snake[ 1 ].x - cameraX + 0.5 ) + width / 2,
      CELLSIZE * ( snake[ 1 ].y - cameraY + 0.5 ) + height / 2
    );
  } else {
    ctx.moveTo(
      CELLSIZE * ( lerp( snake[ 0 ].x, snake[ 1 ].x, turnAnimation ) - cameraX + 0.5 ) + width / 2,
      CELLSIZE * ( lerp( snake[ 0 ].y, snake[ 1 ].y, turnAnimation ) - cameraY + 0.5 ) + height / 2
    );
  }
  for ( let i = 1; i < snake.length - 1; i++ ) {
    ctx.lineTo( CELLSIZE * ( snake[ i ].x - cameraX + 0.5 ) + width / 2, CELLSIZE * ( snake[ i ].y - cameraY + 0.5 ) + height / 2 );
  }
  if ( headFrozen ) {
    ctx.lineTo(
      CELLSIZE * ( snake.at( -1 ).x - cameraX + 0.5 ) + width / 2,
      CELLSIZE * ( snake.at( -1 ).y - cameraY + 0.5 ) + height / 2
    );
  } else {
    ctx.lineTo(
      CELLSIZE * ( lerp( snake.at( -2 ).x, snake.at( -1 ).x, turnAnimation ) - cameraX + 0.5 ) + width / 2,
      CELLSIZE * ( lerp( snake.at( -2 ).y, snake.at( -1 ).y, turnAnimation ) - cameraY + 0.5 ) + height / 2
    );
  }
  ctx.stroke( );
}

function updateCamera( ) {
  let turnAnimation = timeSinceLastTurn / TURNTIME;
  let headFrozen = usedCourtesyTurn;
  if ( !headFrozen ) {
    cameraX = lerp( snake.at( -2 ).x, snakeX, turnAnimation ) + 0.5;
    cameraY = lerp( snake.at( -2 ).y, snakeY, turnAnimation ) + 0.5;
  }
}

function drawDebugRegions( ) {
  ctx.strokeStyle = COLORS.DEBUG;
  ctx.lineWidth = CELLSIZE * 0.2;
  ctx.lineJoin = "miter";
  const xLower = Math.floor( ( cameraX - ( width  / 2 ) / CELLSIZE ) / REGIONSIZE ),
        xUpper = Math.ceil(  ( cameraX + ( width  / 2 ) / CELLSIZE ) / REGIONSIZE ),
        yLower = Math.floor( ( cameraY - ( height / 2 ) / CELLSIZE ) / REGIONSIZE ),
        yUpper = Math.ceil(  ( cameraY + ( height / 2 ) / CELLSIZE ) / REGIONSIZE );
  for ( let x = xLower; x < xUpper; x++ ) {
    let xCell = CELLSIZE * ( x * REGIONSIZE - cameraX ) + width / 2;
    for ( let y = yLower; y < yUpper; y++ ) {
      let yCell = CELLSIZE * ( y * REGIONSIZE - cameraY ) + height / 2;
      ctx.strokeRect( xCell, yCell, CELLSIZE * REGIONSIZE, CELLSIZE * REGIONSIZE );
    }
  }
}

function drawDebugMines( ) {
  ctx.strokeStyle = COLORS.DEBUG;
  ctx.lineWidth = CELLSIZE * 0.6;
  ctx.lineCap = "round";
  const xLower = Math.floor( cameraX - ( width  / 2 ) / CELLSIZE ),
        xUpper = Math.ceil(  cameraX + ( width  / 2 ) / CELLSIZE ),
        yLower = Math.floor( cameraY - ( height / 2 ) / CELLSIZE ),
        yUpper = Math.ceil(  cameraY + ( height / 2 ) / CELLSIZE ); 
  for ( let x = xLower; x < xUpper; x++ ) {
    let xCell = CELLSIZE * ( x - cameraX ) + width / 2;
    for ( let y = yLower; y < yUpper; y++ ) {
      let yCell = CELLSIZE * ( y - cameraY ) + height / 2;
      let cell = regions.get( Math.floor( x / REGIONSIZE ) + "/" + Math.floor( y / REGIONSIZE ) ).get( mod( x, REGIONSIZE ), mod( y, REGIONSIZE )  );
      if ( cell.mine ) {
        ctx.beginPath( );
        ctx.moveTo( xCell + 0.5 * CELLSIZE, yCell + 0.5 * CELLSIZE );
        ctx.lineTo( xCell + 0.5 * CELLSIZE, yCell + 0.5 * CELLSIZE );
        ctx.stroke( );
      }
    }
  }
}

function turnLogic( ) {
  moveSnake( );
}

function moveSnake( ) {
  if ( directionsQueue.length > 0 ) snakeDir = directionsQueue.pop( );
  if ( checkCollision( ) ) {
    if ( usedCourtesyTurn ) {
      reset( "self-collision" );
    } else {
      usedCourtesyTurn = true;
      return;
    }
  } else {
    usedCourtesyTurn = false;
  }
  let vector = dirToVector( snakeDir );
  snakeX += vector.x;
  snakeY += vector.y;
  snake.push( { x: snakeX, y: snakeY } );
  snake.shift( );
}

function checkCollision( ) {
  let vector = dirToVector( snakeDir );
  let tx = snakeX + vector.x,
      ty = snakeY + vector.y;
  let collided = false;
  for ( let i = 1; i < snake.length; i++ ) {
    if ( snake[ i ].x === tx && snake[ i ].y === ty ) {
      collided = true;
      break;
    }
  }
  return collided;
}

let debugmodecounter = 0;

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
    case "D":
      debugmodecounter++;
      if ( debugmodecounter >= 5 ) {
        DEBUGMODE = !DEBUGMODE;
        debugmodecounter = 0;
      }
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

function generateWorldAsNeeded( ) {
  const xLower = Math.floor( ( cameraX - ( width  / 2 ) / CELLSIZE ) / REGIONSIZE ) - 1,
        xUpper = Math.ceil(  ( cameraX + ( width  / 2 ) / CELLSIZE ) / REGIONSIZE ) + 1,
        yLower = Math.floor( ( cameraY - ( height / 2 ) / CELLSIZE ) / REGIONSIZE ) - 1,
        yUpper = Math.ceil(  ( cameraY + ( height / 2 ) / CELLSIZE ) / REGIONSIZE ) + 1;
  for ( let x = xLower; x < xUpper; x++ ) {
    for ( let y = yLower; y < yUpper; y++ ) {
      let cStr = x + "/" + y;
      if ( !regions.has( cStr ) ) {
        regions.set( cStr, new Region( x, y ) );
      }
    }
  }
}

function reset( reason ) {
  initGame( );
}