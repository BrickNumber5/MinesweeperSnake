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
  NUMBER: [ null, "#db4545", "#db7145", "#6de30e", "#004687", "#9500aa", "#e31849", "#0c0027", "#bae5db" ],
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
let clearedTile = false;

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

let textureAtlas;

( async ( ) => {
  let ff = await new FontFace( "Roboto Bold Modified", "url(robotomodified/Roboto-Bold-Modified.ttf)" ).load( );
  document.fonts.add( ff );
  createTextureAtlas( );
  initGame( );
  requestAnimationFrame( draw );
} )( );

window.onresize = setCanvasSize;
function setCanvasSize( ) {
  width  = cnv.width  = window.innerWidth;
  height = cnv.height = window.innerHeight;
}

function initGame( ) {
  snakeX = 9;
  snakeY = 9;
  
  snakeDir = DIRECTION.RIGHT;
  directionsQueue = [ ];
  
  snake = [ { x: 5, y: 9 }, { x: 6, y: 9 }, { x: 7, y: 9 }, { x: 8, y: 9 }, { x: 9, y: 9 } ];
  
  cameraX = 0;
  cameraY = 0;
  
  usedCourtesyTurn = false;
  clearedTile = false;
  
  regions = new Map( );
  regions.set( "0/0", new Region( 0, 0, true ) );
  
  clearedTileAnimations.clear( );
}

let clearedTileAnimations = new Set( );

// Core Loop
let prevTime = -1, elapsedTime, timeSinceLastTurn = 0, timeSinceLastCellUpdate = 0;
function draw( time ) {
  if ( prevTime === -1 || time - prevTime > 5000 ) {
    prevTime = time;
    requestAnimationFrame( draw );
    return;
  }
  
  elapsedTime = time - prevTime;
  prevTime = time;
  
  generateWorldAsNeeded( );
  timeSinceLastCellUpdate += elapsedTime;
  if ( timeSinceLastCellUpdate >= TURNTIME / 3 ) {
    timeSinceLastCellUpdate -= TURNTIME / 3;
    updateCells( );
  }
  
  updateCamera( );
  drawGrid( );
  if ( clearedTileAnimations.size > 0 ) drawClearedTileAnimations( );
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
    for ( let y = yLower - 1; y < yUpper + 1; y++ ) {
      let cell = regions.get( Math.floor( x / REGIONSIZE ) + "/" + Math.floor( y / REGIONSIZE ) ).get( mod( x, REGIONSIZE ), mod( y, REGIONSIZE )  );
      if ( cell.number !== null ) continue;
      if ( cell.mine ) {
        cell.number = -1;
        continue;
      }
      let num = 0;
      for ( let i = -1; i <= 1; i++ ) {
        for ( let j = -1; j <= 1; j++ ) {
          if ( i === 0 && j === 0 ) continue;
          let nx = x + i, ny = y + j;
          let neighborCellCoordinate = Math.floor( nx / REGIONSIZE ) + "/" + Math.floor( ny / REGIONSIZE );
          let neighborCell = regions.get( neighborCellCoordinate ).get( mod( nx, REGIONSIZE ), mod( ny, REGIONSIZE )  );
          if ( neighborCell.mine ) num++;
        }
      }
      cell.number = num;
    }
  }
  let toClear = [ ];
  for ( let x = xLower; x < xUpper; x++ ) {
    for ( let y = yLower; y < yUpper; y++ ) {
      let cell = regions.get( Math.floor( x / REGIONSIZE ) + "/" + Math.floor( y / REGIONSIZE ) ).get( mod( x, REGIONSIZE ), mod( y, REGIONSIZE ) );
      if ( !cell.covered || cell.mine ) continue;
      for ( let i = -1; i <= 1; i++ ) {
        for ( let j = -1; j <= 1; j++ ) {
          if ( i === 0 && j === 0 ) continue;
          let nx = x + i, ny = y + j;
          let neighborCellCoordinate = Math.floor( nx / REGIONSIZE ) + "/" + Math.floor( ny / REGIONSIZE );
          let neighborCell = regions.get( neighborCellCoordinate ).get( mod( nx, REGIONSIZE ), mod( ny, REGIONSIZE ) );
          if ( !neighborCell.covered && neighborCell.number === 0 ) toClear.push( { x: nx, y: ny, c: cell } );
        }
      }
    }
  }
  clearedTileAnimations.forEach( t => { t.time--; if ( t.time <= 0 ) clearedTileAnimations.delete( t ) } );
  toClear.forEach( cell => {
    cell.c.covered = false;
    if ( cell.x >= Math.floor( cameraX - ( width  / 2 ) / CELLSIZE ) - 1
      && cell.x <= Math.ceil(  cameraX + ( width  / 2 ) / CELLSIZE ) + 1
      && cell.y >= Math.floor( cameraY - ( height / 2 ) / CELLSIZE ) - 1
      && cell.y <= Math.ceil(  cameraY + ( height / 2 ) / CELLSIZE ) + 1 ) {
      clearedTileAnimations.add( { x: cell.x, y: cell.y, time: 3 } );
    }
  } );
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
      if ( !cell.covered && cell.number > 0 ) {
        ctx.drawImage( textureAtlas, 100 * cell.number, 0, 100, 100, xCell, yCell, CELLSIZE, CELLSIZE );
      }
    }
  }
}

function drawClearedTileAnimations( ) {
  clearedTileAnimations.forEach( tile => {
    let { x, y, time } = tile;
    let t = timeSinceLastCellUpdate + ( 3 - time ) * ( TURNTIME / 3 );
    ctx.fillStyle = COLORS.COVERED[ ( x + y ) & 1 ];
    let xCell = CELLSIZE * ( x - cameraX ) + width / 2,
        yCell = CELLSIZE * ( y - cameraY ) + height / 2;
    let offset = ( t / TURNTIME ) * CELLSIZE;
    ctx.fillRect( xCell + offset / 2, yCell + offset / 2, CELLSIZE - offset, CELLSIZE - offset );
  } );
}

function drawSnake( ) {
  let turnAnimation = timeSinceLastTurn / TURNTIME;
  let tailFrozen = usedCourtesyTurn || clearedTile,
      headFrozen = usedCourtesyTurn || clearedTile;
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
  let headFrozen = usedCourtesyTurn || clearedTile;
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
  ctx.fillStyle = COLORS.DEBUG;
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
        ctx.fillRect( xCell + 0.2 * CELLSIZE, yCell + 0.2 * CELLSIZE, 0.6 * CELLSIZE, 0.6 * CELLSIZE );
      }
    }
  }
}

function turnLogic( ) {
  moveSnake( );
}

function moveSnake( ) {
  if ( directionsQueue.length > 0 ) snakeDir = directionsQueue.pop( );
  clearedTile = false;
  let col = checkCollision( );
  if ( col ) {
    if ( usedCourtesyTurn ) {
      if ( col === "snake" ) {
        reset( "self-collision" );
        return;
      } else {
        usedCourtesyTurn = false;
        clearedTile = true;
        let vector = dirToVector( snakeDir );
        let tx = snakeX + vector.x,
            ty = snakeY + vector.y;
        let region = regions.get( Math.floor( tx / REGIONSIZE ) + "/" + Math.floor( ty / REGIONSIZE ) );
        let cell = region.get( mod( tx, REGIONSIZE ), mod( ty, REGIONSIZE ) );
        if ( cell.mine ) {
          reset( "explosion" );
        } else {
          cell.covered = false;
          clearedTileAnimations.add( { x: tx, y: ty, time: 3 } );
        }
        return;
      }
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
  let region = regions.get( Math.floor( tx / REGIONSIZE ) + "/" + Math.floor( ty / REGIONSIZE ) );
  let cell = region.get( mod( tx, REGIONSIZE ), mod( ty, REGIONSIZE ) );
  if ( cell.covered ) return "cell";
  for ( let i = 1; i < snake.length; i++ ) {
    if ( snake[ i ].x === tx && snake[ i ].y === ty ) {
      return "snake";
    }
  }
  return null;
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
  const xLower = Math.floor( ( cameraX - width / CELLSIZE ) / REGIONSIZE ) - 1,
        xUpper = Math.ceil(  ( cameraX + width / CELLSIZE ) / REGIONSIZE ) + 1,
        yLower = Math.floor( ( cameraY - height / CELLSIZE ) / REGIONSIZE ) - 1,
        yUpper = Math.ceil(  ( cameraY + height / CELLSIZE ) / REGIONSIZE ) + 1;
  for ( let x = xLower; x < xUpper; x++ ) {
    for ( let y = yLower; y < yUpper; y++ ) {
      let cStr = x + "/" + y;
      if ( !regions.has( cStr ) ) {
        regions.set( cStr, new Region( x, y ) );
      }
    }
  }
}

function createTextureAtlas( ) {
  // Here textureAtlas is the predefined global variable
  let atlas = textureAtlas = document.createElement( "canvas" );
  atlas.width = 1000;
  atlas.height = 100;
  let actx  = atlas.getContext( "2d" );
  
  actx.font = '80px "Roboto Bold Modified"';
  actx.textAlign = "center";
  actx.strokeStyle = "white";
  actx.lineWidth = 5;
  actx.lineJoin = "round";
  for ( let i = 1; i <= 8; i++ ) {
    actx.strokeText( i.toString( ), 100 * i + 50, 75 );
    actx.fillStyle = COLORS.NUMBER[ i ];
    actx.fillText( i.toString( ), 100 * i + 50, 75 );
  }
  
  // document.body.appendChild( atlas );
}

function reset( reason ) {
  initGame( );
}