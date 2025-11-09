/**
 * Graph Visualization Component
 *
 * SVG-based force-directed graph visualization.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { GraphNode, GraphEdge } from '../../db/types';

export interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  seedGid?: string;
  onNodeClick?: (gid: string) => void;
  width?: number;
  height?: number;
}

interface NodePosition {
  gid: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function GraphView({
  nodes,
  edges,
  seedGid,
  onNodeClick,
  width = 800,
  height = 600,
}: GraphViewProps) {
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map());
  const animationRef = useRef<number>();

  // Initialize node positions
  useEffect(() => {
    const positions = new Map<string, NodePosition>();
    const centerX = width / 2;
    const centerY = height / 2;

    nodes.forEach((node, i) => {
      // Arrange in circle initially
      const angle = (i / nodes.length) * 2 * Math.PI;
      const radius = Math.min(width, height) / 3;

      positions.set(node.gid, {
        gid: node.gid,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
      });
    });

    setNodePositions(positions);
  }, [nodes, width, height]);

  // Simple force-directed layout simulation
  useEffect(() => {
    if (nodePositions.size === 0) return;

    const simulate = () => {
      const newPositions = new Map(nodePositions);
      const alpha = 0.3; // Simulation strength

      // Repulsion force between nodes
      newPositions.forEach((node1) => {
        newPositions.forEach((node2) => {
          if (node1.gid === node2.gid) return;

          const dx = node2.x - node1.x;
          const dy = node2.y - node1.y;
          const distSq = dx * dx + dy * dy + 1; // Avoid division by zero
          const dist = Math.sqrt(distSq);

          const force = 2000 / distSq; // Repulsion strength

          node1.vx -= (dx / dist) * force * alpha;
          node1.vy -= (dy / dist) * force * alpha;
        });
      });

      // Attraction force along edges
      edges.forEach((edge) => {
        const source = newPositions.get(edge.fromGid);
        const target = newPositions.get(edge.toGid);
        if (!source || !target) return;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 1;

        const force = dist * 0.01; // Spring strength

        source.vx += (dx / dist) * force * alpha;
        source.vy += (dy / dist) * force * alpha;
        target.vx -= (dx / dist) * force * alpha;
        target.vy -= (dy / dist) * force * alpha;
      });

      // Apply velocity and damping
      newPositions.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.8; // Damping
        node.vy *= 0.8;

        // Keep within bounds
        node.x = Math.max(30, Math.min(width - 30, node.x));
        node.y = Math.max(30, Math.min(height - 30, node.y));
      });

      setNodePositions(newPositions);

      // Continue simulation
      animationRef.current = requestAnimationFrame(simulate);
    };

    // Run simulation for a limited time
    animationRef.current = requestAnimationFrame(simulate);
    const timeout = setTimeout(() => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }, 3000); // Run for 3 seconds

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      clearTimeout(timeout);
    };
  }, [edges, width, height]);

  return (
    <svg
      width={width}
      height={height}
      className="graph-view"
      style={{ border: '1px solid var(--color-border)', borderRadius: '8px' }}
    >
      {/* Edges */}
      <g className="graph-edges">
        {edges.map((edge, i) => {
          const source = nodePositions.get(edge.fromGid);
          const target = nodePositions.get(edge.toGid);
          if (!source || !target) return null;

          return (
            <line
              key={`${edge.fromGid}-${edge.toGid}-${i}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="#94a3b8"
              strokeWidth={Math.max(1, edge.weight * 2)}
              strokeOpacity={0.6}
              markerEnd="url(#arrowhead)"
            />
          );
        })}
      </g>

      {/* Arrow marker */}
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Nodes */}
      <g className="graph-nodes">
        {nodes.map((node) => {
          const pos = nodePositions.get(node.gid);
          if (!pos) return null;

          const isSeed = node.gid === seedGid;
          const radius = isSeed ? 12 : 8;
          const fill = isSeed ? '#3b82f6' : '#64748b';

          return (
            <g
              key={node.gid}
              className="graph-node"
              onClick={() => onNodeClick?.(node.gid)}
              style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius}
                fill={fill}
                stroke="#ffffff"
                strokeWidth={2}
                opacity={0.9}
              />
              <text
                x={pos.x}
                y={pos.y - radius - 5}
                textAnchor="middle"
                fontSize="11"
                fill="var(--color-fg)"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {node.title || `Page ${node.pageNo}`}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export interface GraphPanelProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  seedGid?: string;
  onNodeClick?: (gid: string) => void;
  loading?: boolean;
  error?: string | null;
}

export function GraphPanel({
  nodes,
  edges,
  seedGid,
  onNodeClick,
  loading,
  error,
}: GraphPanelProps) {
  if (loading) {
    return (
      <div className="graph-panel-loading">
        <div className="spinner"></div>
        <p>Loading graph...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="graph-panel-error">
        <p>Error: {error}</p>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="graph-panel-empty">
        <p>No graph data to display</p>
        <p className="hint">Search for a page or select a result to explore its connections</p>
      </div>
    );
  }

  return (
    <div className="graph-panel">
      <div className="graph-info">
        <span>{nodes.length} nodes</span>
        <span>{edges.length} edges</span>
      </div>
      <GraphView
        nodes={nodes}
        edges={edges}
        seedGid={seedGid}
        onNodeClick={onNodeClick}
        width={800}
        height={600}
      />
    </div>
  );
}
