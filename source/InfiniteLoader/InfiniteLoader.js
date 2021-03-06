/** @flow */
import { Component, PropTypes } from 'react'
import shouldPureComponentUpdate from 'react-pure-render/function'

/**
 * Higher-order component that manages lazy-loading for "infinite" data.
 * This component decorates a virtual component and just-in-time prefetches rows as a user scrolls.
 * It is intended as a convenience component; fork it if you'd like finer-grained control over data-loading.
 */
export default class InfiniteLoader extends Component {
  shouldComponentUpdate = shouldPureComponentUpdate

  static propTypes = {
    /**
     * Function respondible for rendering a virtualized component.
     * This function should implement the following signature:
     * ({ onRowsRendered, registerChild }) => PropTypes.element
     *
     * The specified :onRowsRendered function should be passed through to the child's :onRowsRendered property.
     * The :registerChild callback should be set as the virtualized component's :ref.
     */
    children: PropTypes.func.isRequired,

    /**
     * Function responsible for tracking the loaded state of each row.
     * It should implement the following signature: (index: number): boolean
     */
    isRowLoaded: PropTypes.func.isRequired,

    /**
     * Callback to be invoked when more rows must be loaded.
     * It should implement the following signature: ({ startIndex, stopIndex }): Promise
     * The returned Promise should be resolved once row data has finished loading.
     * It will be used to determine when to refresh the list with the newly-loaded data.
     * This callback may be called multiple times in reaction to a single scroll event.
     */
    loadMoreRows: PropTypes.func.isRequired,

    /**
     * Number of rows in list; can be arbitrary high number if actual number is unknown.
     */
    rowsCount: PropTypes.number.isRequired,

    /**
     * Threshold at which to pre-fetch data.
     * A threshold X means that data will start loading when a user scrolls within X rows.
     * This value defaults to 15.
     */
    threshold: PropTypes.number.isRequired
  }

  static defaultProps = {
    rowsCount: 0,
    threshold: 15
  }

  constructor (props, context) {
    super(props, context)

    this._onRowsRendered = this._onRowsRendered.bind(this)
    this._registerChild = this._registerChild.bind(this)
  }

  render () {
    const { children } = this.props

    return children({
      onRowsRendered: this._onRowsRendered,
      registerChild: this._registerChild
    })
  }

  _onRowsRendered ({ startIndex, stopIndex }) {
    const { isRowLoaded, loadMoreRows, rowsCount, threshold } = this.props

    this._lastRenderedStartIndex = startIndex
    this._lastRenderedStopIndex = stopIndex

    const unloadedRanges = scanForUnloadedRanges({
      isRowLoaded,
      startIndex: Math.max(0, startIndex - threshold),
      stopIndex: Math.min(rowsCount, stopIndex + threshold)
    })

    unloadedRanges.forEach(unloadedRange => {
      let promise = loadMoreRows(unloadedRange)
      if (promise) {
        promise.then(() => {
          // Refresh the visible rows if any of them have just been loaded.
          // Otherwise they will remain in their unloaded visual state.
          if (
            isRangeVisible({
              lastRenderedStartIndex: this._lastRenderedStartIndex,
              lastRenderedStopIndex: this._lastRenderedStopIndex,
              startIndex: unloadedRange.startIndex,
              stopIndex: unloadedRange.stopIndex
            })
          ) {
            if (this._registeredChild) {
              this._registeredChild.forceUpdate()
            }
          }
        })
      }
    })
  }

  _registerChild (registeredChild) {
    this._registeredChild = registeredChild
  }
}

/**
 * Determines if the specified start/stop range is visible based on the most recently rendered range.
 */
export function isRangeVisible ({
  lastRenderedStartIndex,
  lastRenderedStopIndex,
  startIndex,
  stopIndex
}) {
  return !(startIndex > lastRenderedStopIndex || stopIndex < lastRenderedStartIndex)
}

/**
 * Returns all of the ranges within a larger range that contain unloaded rows.
 */
export function scanForUnloadedRanges ({ isRowLoaded, startIndex, stopIndex }) {
  const unloadedRanges = []
  let rangeStartIndex = null
  let rangeStopIndex = null

  for (let i = startIndex; i <= stopIndex; i++) {
    let loaded = isRowLoaded(i)

    if (!loaded) {
      rangeStopIndex = i
      if (rangeStartIndex === null) {
        rangeStartIndex = i
      }
    } else if (rangeStopIndex !== null) {
      unloadedRanges.push({
        startIndex: rangeStartIndex,
        stopIndex: rangeStopIndex
      })

      rangeStartIndex = rangeStopIndex = null
    }
  }

  if (rangeStopIndex !== null) {
    unloadedRanges.push({
      startIndex: rangeStartIndex,
      stopIndex: rangeStopIndex
    })
  }

  return unloadedRanges
}
