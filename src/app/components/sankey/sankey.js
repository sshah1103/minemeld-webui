d3.sankey = function() {
    var sankey = {},
        minNodeWidth = 16,
        maxNodeWidth = 80,
        nodePadding = 8,
        size = [1, 1],
        nodes = [],
        links = [];

    sankey.minNodeWidth = function(_) {
        if (!arguments.length) return minNodeWidth;
        minNodeWidth = _;
        return sankey;
    }

    sankey.maxNodeWidth = function(_) {
        if (!arguments.length) return maxNodeWidth;
        maxNodeWidth = _;
        return sankey;
    }

    sankey.nodePadding = function(_) {
        if (!arguments.length) return nodePadding;
        nodePadding = +_;
        return sankey;
    };

    sankey.nodes = function(_) {
        if (!arguments.length) return nodes;
        nodes = _;
        return sankey;
    };

    sankey.links = function(_) {
        if (!arguments.length) return links;
        links = _;
        return sankey;
    };

    sankey.size = function(_) {
        if (!arguments.length) return size;
        size = _;
        return sankey;
    };

    sankey.layout = function(iterations) {
        computeNodeLinks();
        computeNodeValues();
        computeNodeBreadths();
        computeNodeDepths(iterations);
        computeLinkDepths();
        centerNodeBreadths();
        return sankey;
    };

    sankey.relayout = function() {
        computeLinkDepths();
        return sankey;
    };

    sankey.link = function() {
        var curvature = .5;

        function link(d) {
            var x0 = d.source.x + d.source.dx / 2,
                x1 = d.target.x + d.target.dx / 2,
                xi = d3.interpolateNumber(x0, x1),
                x2 = xi(curvature),
                x3 = xi(1 - curvature),
                y0 = d.source.y + d.source.dx / 2,
                y1 = d.target.y + d.target.dx / 2;
            return "M" + x0 + "," + y0 + "C" + x2 + "," + y0 + " " + x3 + "," + y1 + " " + x1 + "," + y1;
        }

        link.curvature = function(_) {
            if (!arguments.length) return curvature;
            curvature = +_;
            return link;
        };

        return link;
    };

    // Populate the sourceLinks and targetLinks for each node.
    // Also, if the source and target are not objects, assume they are indices.
    function computeNodeLinks() {
        nodes.forEach(function(node) {
            node.sourceLinks = [];
            node.targetLinks = [];
        });
        links.forEach(function(link) {
            var source = link.source,
                target = link.target;
            if (typeof source === "number") source = link.source = nodes[link.source];
            if (typeof target === "number") target = link.target = nodes[link.target];
            source.sourceLinks.push(link);
            target.targetLinks.push(link);
        });
    }

    // Compute the value (size) of each node by summing the associated links.
    function computeNodeValues() {
        // nothing to do, nodes should already have a value

        // var ms, mt, totalLinksValue;

        // totalLinksValue = d3.sum(links, value);

        // nodes.forEach(function(node) {
        //   ms = d3.max(node.sourceLinks, value);
        //   mt = d3.max(node.targetLinks, value);
        //   ms = isNaN(ms) ? 0 : ms;
        //   mt = isNaN(mt) ? 0 : mt;

        //   node.value = maxNodeWidth*Math.max(ms, mt)/totalLinksValue;
        // });
    }

    // Iteratively assign the breadth (x-position) for each node.
    // Nodes are assigned the maximum breadth of incoming neighbors plus one;
    // nodes with no incoming links are assigned breadth zero, while
    // nodes with no outgoing links are assigned the maximum breadth.
    function computeNodeBreadths() {
        var remainingNodes = nodes,
            nextNodes,
            actualMaxNodeWidth,
            totalLinksValue,
            totalNodesValue,
            x = 0;

        totalLinksValue = d3.sum(links, value);
        totalNodesValue = d3.sum(nodes, value);

        while (remainingNodes.length) {
            nextNodes = [];
            remainingNodes.forEach(function(node) {
                var mt, ms;

                node.x = x;

                ms = d3.max(node.sourceLinks, value);
                mt = d3.max(node.targetLinks, value);
                mt = isNaN(mt) ? 0 : mt;
                ms = isNaN(ms) ? 0 : ms;

                node.dx = Math.max(
                    minNodeWidth + (maxNodeWidth - minNodeWidth) * node.value / totalNodesValue,
                    minNodeWidth + (maxNodeWidth - minNodeWidth) * Math.max(mt, ms) / totalLinksValue
                );

                node.sourceLinks.forEach(function(link) {
                    if (nextNodes.indexOf(link.target) < 0) {
                        nextNodes.push(link.target);
                    }
                });
            });
            remainingNodes = nextNodes;
            ++x;
        }

        //
        moveSinksRight(x);

        nodes.forEach(function(node) {
            if (!node.targetLinks.length) {
                node.x = 0;
            }
        });

        actualMaxNodeWidth = d3.max(nodes, function(d) {
            return d.dx
        });
        scaleNodeBreadths((size[0] - actualMaxNodeWidth) / (x - 1));
    }

    // function scaleNodeDx(node) {
    //   var currentMaxNodeWidth = 0,
    //       kw;

    //   currentMaxNodeWidth = d3.max(nodes, function(d) { return d.dx; });

    //   kw = (maxNodeWidth-minNodeWidth)/currentMaxNodeWidth;
    //   nodes.forEach(function(node) {
    //     node.dx = minNodeWidth+node.dx*kw;
    //   });
    // }

    function moveSourcesRight() {
        nodes.forEach(function(node) {
            if (!node.targetLinks.length) {
                node.x = d3.min(node.sourceLinks, function(d) {
                    return d.target.x;
                }) - 1;
            }
        });
    }

    function moveSinksRight(x) {
        nodes.forEach(function(node) {
            if (!node.sourceLinks.length) {
                node.x = x - 1;
            }
        });
    }

    function scaleNodeBreadths(kx) {
        nodes.forEach(function(node) {
            node.x *= kx;
        });
    }

    function computeNodeDepths(iterations) {
        var nodesByBreadth = d3.nest()
            .key(function(d) {
                return d.x;
            })
            .sortKeys(d3.ascending)
            .entries(nodes)
            .map(function(d) {
                return d.values;
            });

        //
        initializeNodeDepth();
        resolveCollisions();

        for (var alpha = 1; iterations > 0; --iterations) {
            relaxRightToLeft(alpha *= .99);
            resolveCollisions();
            relaxLeftToRight(alpha);
            resolveCollisions();
        }

        function initializeNodeDepth() {
            var ky = d3.min(nodesByBreadth, function(nodes) {
                return (size[1] - (nodes.length - 1) * nodePadding) / d3.sum(nodes, function(node) {
                    return node.dx;
                });
            });

            nodesByBreadth.forEach(function(nodes) {
                nodes.forEach(function(node, i) {
                    node.y = i;
                    node.dy = node.dx * ky;
                });
            });

            var totalLinksValue = d3.sum(links, value);
            links.forEach(function(link) {
                link.dy = maxNodeWidth * link.value / totalLinksValue;
            });
        }

        function relaxLeftToRight(alpha) {
            nodesByBreadth.forEach(function(nodes, breadth) {
                nodes.forEach(function(node) {
                    if (node.targetLinks.length) {
                        var y = d3.sum(node.targetLinks, weightedSource) / d3.sum(node.targetLinks, value);
                        node.y += (y - center(node)) * alpha;
                    }
                });
            });

            function weightedSource(link) {
                return center(link.source) * link.value;
            }
        }

        function relaxRightToLeft(alpha) {
            nodesByBreadth.slice().reverse().forEach(function(nodes) {
                nodes.forEach(function(node) {
                    if (node.sourceLinks.length) {
                        var y = d3.sum(node.sourceLinks, weightedTarget) / d3.sum(node.sourceLinks, value);
                        node.y += (y - center(node)) * alpha;
                    }
                });
            });

            function weightedTarget(link) {
                return center(link.target) * link.value;
            }
        }

        function resolveCollisions() {
            nodesByBreadth.forEach(function(nodes) {
                var node,
                    dy,
                    y0 = 0,
                    n = nodes.length,
                    i;

                // Push any overlapping nodes down.
                nodes.sort(ascendingDepth);
                for (i = 0; i < n; ++i) {
                    node = nodes[i];
                    dy = y0 - node.y;
                    if (dy > 0) node.y += dy;
                    y0 = node.y + node.dy + nodePadding;
                }

                // If the bottommost node goes outside the bounds, push it back up.
                dy = y0 - nodePadding - size[1];
                if (dy > 0) {
                    y0 = node.y -= dy;

                    // Push any overlapping nodes back up.
                    for (i = n - 2; i >= 0; --i) {
                        node = nodes[i];
                        dy = node.y + node.dy + nodePadding - y0;
                        if (dy > 0) node.y -= dy;
                        y0 = node.y;
                    }
                }
            });
        }

        function ascendingDepth(a, b) {
            return a.y - b.y;
        }
    }

    function computeLinkDepths() {
        nodes.forEach(function(node) {
            node.sourceLinks.sort(ascendingTargetDepth);
            node.targetLinks.sort(ascendingSourceDepth);
        });
        nodes.forEach(function(node) {
            var sy = 0,
                ty = 0;
            node.sourceLinks.forEach(function(link) {
                link.sy = sy;
                sy += link.dy;
            });
            node.targetLinks.forEach(function(link) {
                link.ty = ty;
                ty += link.dy;
            });
        });

        function ascendingSourceDepth(a, b) {
            return a.source.y - b.source.y;
        }

        function ascendingTargetDepth(a, b) {
            return a.target.y - b.target.y;
        }
    }

    function centerNodeBreadths() {
        var nodesByBreadth = d3.nest()
            .key(function(d) {
                return d.x;
            })
            .sortKeys(d3.ascending)
            .entries(nodes)
            .map(function(d) {
                return d.values;
            });
        var maxNodeBreadthWidth;

        nodesByBreadth.forEach(function(nodes) {
            maxNodeBreadthWidth = d3.max(nodes, function(d) {
                return d.dx;
            });

            nodes.forEach(function(node, i) {
                node.x += (maxNodeBreadthWidth - node.dx) / 2;
            });
        });
    }

    function center(node) {
        return node.y + node.dy / 2;
    }

    function value(link) {
        return link.value;
    }

    return sankey;
};