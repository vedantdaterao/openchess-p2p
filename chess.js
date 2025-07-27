window.onload = () => {
  SetBoard();
  SetPieces();
  // console.log("board :", BOARD);
};

// const boardSize = Math.min(window.innerWidth, window.innerHeight) * 0.8;
const SQUARE_SIDE = "70px";
// const SQUARE_SIDE = boardSize / 8 + "px";
const COLOR_SQUARE_LIGHT = "#c0d6df"; // "lightblue";
const COLOR_SQUARE_DARK = "#4f6d7a"; // "#495670";
const BOARD = [];
const MOVES_PLAYED = [];
let TURN = "w";
const PIECE = Object.freeze({
  pawn: "P",
  knight: "N",
  king: "K",
  rook: "R",
  bishop: "B",
  queen: "Q",
});

let SELECTED_SQUARE = null;

const board = document.getElementsByClassName("board")[0];

function square_div(id) {
  const div = document.createElement("div");
  div.id = id;
  // div.style.width = SQUARE_SIDE;
  // div.style.height = SQUARE_SIDE;
  div.style.backgroundColor = COLOR_SQUARE_LIGHT;
  div.className = "square";

  div.addEventListener("dragover", (ev) => {
    ev.preventDefault(); //
    ev.dataTransfer.dropEffect = "move";
  });

  div.addEventListener("drop", (ev) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    const from = ev.dataTransfer.getData("text/plain");
    let to = ev.target.id;
    if (ev.target.tagName === "IMG") {
      to = ev.target.parentElement.id;
    }
    // console.log("to: ", to);
    move(from, to);
    SELECTED_SQUARE = null;
  });

  div.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (!(SELECTED_SQUARE === null)) {
      if (SELECTED_SQUARE === ev.target.parentElement.id) return;
      let to = ev.target.id;
      if (ev.target.tagName === "IMG") {
        to = ev.target.parentElement.id;
      }
      move(SELECTED_SQUARE, to);
      SELECTED_SQUARE = null;
    }
    clearHighlights();
  });
  return div;
}

function piece_img(src) {
  const type = src.split("/")[1].split(".")[0];
  const img_tag = document.createElement("img");
  img_tag.src = src;
  img_tag.id = type;
  img_tag.className = "piece";
  img_tag.draggable = "true";
  img_tag.addEventListener("dragstart", (ev) => {
    clearHighlights();
    const parentId = ev.target.parentElement.id;
    ev.dataTransfer.setData("text/plain", parentId);
  });
  img_tag.addEventListener("click", (ev) => {
    if (SELECTED_SQUARE === null) {
      SELECTED_SQUARE = ev.target.parentElement.id;
      clearHighlights();
      document.getElementById(SELECTED_SQUARE).classList.add("highlight_piece");
      const fromSquare = ev.target.parentElement.id;
      const moves = legalMoves(ev.target.id, fromSquare);

      for (const [x, y] of moves) {
        const targetId = toNotation([x, y]);
        const squareDiv = document.getElementById(targetId);
        squareDiv.classList.add("highlight");
      }
    }
  });
  return img_tag;
}

function clearHighlights() {
  document.querySelectorAll(".highlight").forEach((el) => {
    el.classList.remove("highlight");
  });
  document.querySelectorAll(".highlight_piece").forEach((el) => {
    el.classList.remove("highlight_piece");
  });
}

function SetBoard() {
  const file = "abcdefgh";
  const pieceOrder = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  let bw = false;

  for (let x = 0; x < 8; x++) {
    const rank = [];

    for (let y = 0; y < 8; y++) {
      const square_id = file[y] + (8 - x);
      const square = square_div(square_id);

      if (bw === true) {
        square.style.backgroundColor = COLOR_SQUARE_DARK;
        bw = false;
      } else if (bw === false) {
        bw = true;
      }

      board.appendChild(square);

      rank.push({ id: square_id, piece: "" });
    }
    if (bw === true) {
      bw = false;
    } else if (bw === false) {
      bw = true;
    }
    BOARD.push(rank);
  }
}

function SetPieces() {
  const file = "abcdefgh";
  const pieceOrder = ["R", "N", "B", "Q", "K", "B", "N", "R"];

  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      const square_id = BOARD[x][y]["id"];
      const square = document.getElementById(square_id);
      let piece = "";
      switch (x) {
        case 0:
          piece = "b" + pieceOrder[y];
          break;
        case 1:
          piece = "bP";
          break;
        case 7:
          piece = "w" + pieceOrder[y];
          break;
        case 6:
          piece = "wP";
          break;
        default:
          piece = "";
      }
      if (piece != "" && square.childElementCount == 0) {
        square.appendChild(piece_img(`piece_riohacha/${piece}.svg`));
      }
      BOARD[x][y]["piece"] = piece;
    }
  }
}

function SetSinglePiece(square, piece) {
  const sq = document.getElementById(String(square));
  if (sq.childElementCount == 0) {
    sq.appendChild(piece_img(`piece_riohacha/${piece}.svg`));
    const [x, y] = fromNotation(square);
    BOARD[x][y]["piece"] = piece;
  } else console.log("square is not empty");
}

function fromNotation(str) {
  const pos = String(str).split("");
  return [8 - pos[1], pos[0].charCodeAt(0) - "a".charCodeAt(0)];
}

function toNotation(position) {
  const file = String.fromCharCode("a".charCodeAt(0) + position[1]);
  const rank = 8 - position[0];
  return file + rank;
}

function isPiecePresent(position) {
  const [x, y] = position;
  if (!isInBounds(x, y)) {
    console.warn("isPiecePresent: called with out-of-bounds", x, y);
    return null;
  }
  const piece = BOARD[x][y].piece;
  return piece ? piece[0] : null;
}

function isInBounds(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function legalMoves(piece, position) {
  const [side, type] = piece.split("");
  const p = fromNotation(position);

  switch (type) {
    // PAWN
    case PIECE.pawn: {
      const moves = [];
      const direction = side === "w" ? -1 : 1;
      const startRow = side === "w" ? 6 : 1;

      const [row, col] = p;

      const oneForward = [row + direction, col];
      if (isInBounds(...oneForward) && isPiecePresent(oneForward) === null) {
        moves.push(oneForward);

        const twoForward = [row + 2 * direction, col];
        if (row === startRow && isPiecePresent(twoForward) === null)
          moves.push(twoForward);
      }

      const captures = [
        [row + direction, col - 1],
        [row + direction, col + 1],
      ];

      for (const cap of captures) {
        if (!isInBounds(...cap)) continue;

        const piece = isPiecePresent(cap);
        if (piece !== null && piece !== side) {
          moves.push(cap);
        }
      }

      return moves;
    }

    // KING
    case PIECE.king: {
      const moves = [];
      for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
          if (x === 0 && y === 0) continue;
          const nx = p[0] + x;
          const ny = p[1] + y;
          const pos = [nx, ny];

          if (!isInBounds(nx, ny)) continue;

          const occ = isPiecePresent(pos);
          if (occ === null || occ !== side) {
            moves.push(pos);
          }
        }
      }
      return moves;
    }

    // ROOK
    case PIECE.rook: {
      const moves = [];
      const directions = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];

      for (const [dx, dy] of directions) {
        let nx = p[0] + dx;
        let ny = p[1] + dy;

        while (isInBounds(nx, ny)) {
          const pos = [nx, ny];
          const piece = isPiecePresent(pos);
          if (piece !== null) {
            if (piece !== side) {
              moves.push(pos);
            }
            break;
          }

          moves.push(pos);
          nx += dx;
          ny += dy;
        }
      }
      return moves;
    }

    // BISHOP
    case PIECE.bishop: {
      const moves = [];
      const directions = [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ];
      for (const [dx, dy] of directions) {
        let nx = p[0] + dx;
        let ny = p[1] + dy;

        while (isInBounds(nx, ny)) {
          const piece = isPiecePresent([nx, ny]);
          if (piece !== null) {
            if (piece !== side) {
              moves.push([nx, ny]);
            }
            break;
          }

          moves.push([nx, ny]);
          nx += dx;
          ny += dy;
        }
      }
      return moves;
    }

    // QUEEN
    // -1,-1 -1,0 -1,1
    //  0,-1  0,0  0,1
    //  1,-1  1,0  1,1
    case PIECE.queen: {
      const moves = [];
      const directions = [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
      ];
      for (const [dx, dy] of directions) {
        let nx = p[0] + dx;
        let ny = p[1] + dy;

        while (isInBounds(nx, ny)) {
          const piece = isPiecePresent([nx, ny]);
          if (piece !== null) {
            if (piece !== side) {
              moves.push([nx, ny]);
            }
            break;
          }

          moves.push([nx, ny]);
          nx += dx;
          ny += dy;
        }
      }
      return moves;
    }

    // KNIGHT
    case PIECE.knight: {
      const moves = [];
      const delta = [
        [-2, -1],
        [-2, 1],
        [-1, -2],
        [-1, 2],
        [1, -2],
        [1, 2],
        [2, -1],
        [2, 1],
      ];
      for (const [x, y] of delta) {
        let nx = p[0] + x;
        let ny = p[1] + y;

        if (!isInBounds(nx, ny)) continue;
        if (
          isPiecePresent([nx, ny]) === null ||
          isPiecePresent([nx, ny]) !== side
        ) {
          moves.push([nx, ny]);
        }
      }
      return moves;
    }
  }
}

function move(x, y) {
  const [x1, x2] = fromNotation(x);
  const [y1, y2] = fromNotation(y);

  const div_x = document.getElementById(x);
  const div_y = document.getElementById(y);

  const piece_img = div_x.children[0];

  const side = String(piece_img.id)[0];
  if (side !== TURN) {
    console.warn(`It's ${TURN === "w" ? "White's" : "Black's"} turn.`);
    return;
  }

  if (piece_img) {
    const possibleMoves = legalMoves(String(piece_img.id), x);
    const isLegal = possibleMoves.some(([a, b]) => a === y1 && b === y2);

    if (!isLegal) {
      console.warn(`Illegal move: ${x} to ${y}`);
      console.log("possible moves: ", JSON.stringify(possibleMoves));
      return;
    }

    const captured = div_y.children[0];

    if (captured) div_y.removeChild(captured);
    div_y.appendChild(piece_img);
    div_x.innerHTML = "";

    BOARD[x1][x2]["piece"] = "";
    BOARD[y1][y2]["piece"] = piece_img.id;

    MOVES_PLAYED.push({
      from: x,
      to: y,
      piece: piece_img.id,
      captured: captured?.id || null,
    });

    MoveHistory(MOVES_PLAYED.at(-1));

    // Switch turn
    TURN = TURN === "w" ? "b" : "w";

    console.log("MOVES PLAYED: ", MOVES_PLAYED);
  } else {
    console.error("no piece at location :", x);
  }
}

const history_div = document.getElementsByClassName("move_history")[0];
let moveCount = 1;
function MoveHistory(move) {
  const pieceType = move.piece[1];
  const from = move.from;
  const to = move.to;
  const isCapture = move.captured !== null;

  let notation = "";

  // Handle castling
  if (move.piece[1] === "K") {
    const fromFile = from[0];
    const toFile = to[0];

    if (from === "e1" && (to === "g1" || to === "c1")) {
      notation = to === "g1" ? "O-O" : "O-O-O";
    } else if (from === "e8" && (to === "g8" || to === "c8")) {
      notation = to === "g8" ? "O-O" : "O-O-O";
    }
  }

  if (!notation) {
    const pieceChar = pieceType === "P" ? "" : pieceType.toUpperCase();

    if (pieceType === "P" && isCapture) {
      notation = from[0] + "x" + to;
    } else if (isCapture) {
      notation = pieceChar + "x" + to;
    } else {
      notation = pieceChar + to;
    }
  }

  const span = document.createElement("span");
  span.textContent = notation;
  span.classList.add("move");
  if (TURN === "w") {
    const p = document.createElement("p");
    const number = document.createElement("span");
    number.textContent = `${moveCount} `;
    // number.classList.add("move-number");

    p.appendChild(number);
    p.appendChild(span);
    history_div.appendChild(p);
    moveCount++;
  } else {
    const lastP = history_div.lastElementChild;
    if (lastP) lastP.append(span);
  }

  history_div.scrollTop = history_div.scrollHeight;
}
